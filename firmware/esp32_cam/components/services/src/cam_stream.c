#include "cam_stream.h"

#include <ctype.h>
#include <inttypes.h>
#include <stdatomic.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

#include "cam_camera.h"
#include "cam_time.h"
#include "esp_http_server.h"
#include "esp_log.h"
#include "esp_timer.h"
#include "freertos/FreeRTOS.h"
#include "freertos/task.h"
#include "sdkconfig.h"
#include "security_manager.h"

static const char *TAG = "cam_stream";

#define PART_BOUNDARY "shhcamframe7f3a9c"
#define STREAM_CONTENT_TYPE "multipart/x-mixed-replace;boundary=" PART_BOUNDARY
#define STREAM_BOUNDARY "\r\n--" PART_BOUNDARY "\r\n"
#define STREAM_PART_HDR "Content-Type: image/jpeg\r\nContent-Length: %u\r\n\r\n"
#define FRAME_INTERVAL_US (1000000LL / CONFIG_CAM_STREAM_MAX_FPS)

typedef struct {
    httpd_req_t *req;   /* bản sao async, phải httpd_req_async_handler_complete() khi xong */
    framesize_t size;
    int quality;
} stream_job_t;

static const cam_config_t *s_cfg;
static atomic_bool s_busy = false;

/* ---- kiểm tra yêu cầu ----------------------------------------------------------------------------------- */

static esp_err_t reply(httpd_req_t *req, const char *status, const char *msg)
{
    httpd_resp_set_status(req, status);
    httpd_resp_set_type(req, "text/plain");
    return httpd_resp_sendstr(req, msg);
}

/* ts chỉ gồm chữ số, tối đa 12 ký tự (đủ tới năm 33658) — chặn tràn khi parse. */
static bool parse_ts(const char *s, int64_t *out)
{
    size_t n = strnlen(s, 13);
    if (n == 0 || n > 12) {
        return false;
    }
    for (size_t i = 0; i < n; i++) {
        if (!isdigit((unsigned char)s[i])) {
            return false;
        }
    }
    *out = strtoll(s, NULL, 10);
    return true;
}

/* Header quá dài → httpd trả ESP_ERR_HTTPD_RESULT_TRUNC → coi như thiếu. */
static bool get_hdr(httpd_req_t *req, const char *name, char *buf, size_t cap)
{
    return httpd_req_get_hdr_value_str(req, name, buf, cap) == ESP_OK && buf[0] != '\0';
}

static bool authorized(httpd_req_t *req)
{
    char dev[CAM_DEVICE_ID_MAX + 1];
    char ts_str[16];
    char sig[SM_HMAC_HEX_LEN + 1];
    int64_t ts, now;

    if (!get_hdr(req, "X-Device-Id", dev, sizeof(dev)) || !get_hdr(req, "X-Timestamp", ts_str, sizeof(ts_str)) ||
        !get_hdr(req, "X-Signature", sig, sizeof(sig))) {
        return false;
    }
    if (strcmp(dev, s_cfg->device_id) != 0 || !parse_ts(ts_str, &ts) || !cam_time_now(&now)) {
        return false;
    }
    sm_verify_result_t r = sm_device_verify(s_cfg->device_secret, s_cfg->device_id, ts, sig, now);
    if (r != SM_VERIFY_OK) {
        /* Chỉ log loại lỗi, không log chữ ký. */
        ESP_LOGW(TAG, "stream auth failed (%s)", r == SM_VERIFY_EXPIRED ? "timestamp expired" : "bad signature");
        return false;
    }
    return true;
}

static bool parse_params(httpd_req_t *req, framesize_t *size, int *quality)
{
    *size = FRAMESIZE_VGA;   /* vừa màn hình 800×480 của Gateway (§5.4) */
    *quality = 12;

    char query[64];
    esp_err_t err = httpd_req_get_url_query_str(req, query, sizeof(query));
    if (err == ESP_ERR_NOT_FOUND) {
        return true;   /* không có query → mặc định */
    }
    if (err != ESP_OK) {
        return false;  /* query quá dài */
    }

    char val[8];
    err = httpd_query_key_value(query, "fs", val, sizeof(val));
    if (err == ESP_OK) {
        if (strcmp(val, "vga") == 0) {
            *size = FRAMESIZE_VGA;
        } else if (strcmp(val, "qvga") == 0) {
            *size = FRAMESIZE_QVGA;
        } else {
            return false;
        }
    } else if (err != ESP_ERR_NOT_FOUND) {
        return false;
    }

    err = httpd_query_key_value(query, "q", val, sizeof(val));
    if (err == ESP_OK) {
        char *end;
        long q = strtol(val, &end, 10);
        if (end == val || *end != '\0' || q < 10 || q > 30) {
            return false;
        }
        *quality = (int)q;
    } else if (err != ESP_ERR_NOT_FOUND) {
        return false;
    }
    return true;
}

/* ---- phát luồng ----------------------------------------------------------------------------------------- */

static void stream_task(void *arg)
{
    stream_job_t job = *(stream_job_t *)arg;
    free(arg);
    httpd_req_t *req = job.req;

    esp_err_t err = cam_camera_stream_begin(job.size, job.quality);
    bool chunked = (err == ESP_OK);
    if (chunked) {
        httpd_resp_set_type(req, STREAM_CONTENT_TYPE);
        httpd_resp_set_hdr(req, "Cache-Control", "no-store");
    } else {
        reply(req, "500 Internal Server Error", "camera not ready");
    }

    uint32_t frames = 0;
    int64_t started = esp_timer_get_time();
    while (err == ESP_OK) {
        int64_t t0 = esp_timer_get_time();
        camera_fb_t *fb = cam_camera_fb_get();
        if (fb == NULL) {
            ESP_LOGW(TAG, "frame grab failed");
            break;
        }
        char part[64];
        int hlen = snprintf(part, sizeof(part), STREAM_PART_HDR, (unsigned)fb->len);
        err = httpd_resp_send_chunk(req, STREAM_BOUNDARY, strlen(STREAM_BOUNDARY));
        if (err == ESP_OK) {
            err = httpd_resp_send_chunk(req, part, hlen);
        }
        if (err == ESP_OK) {
            err = httpd_resp_send_chunk(req, (const char *)fb->buf, fb->len);
        }
        cam_camera_fb_return(fb);
        frames++;

        int64_t wait_us = FRAME_INTERVAL_US - (esp_timer_get_time() - t0);
        if (err == ESP_OK && wait_us > 1000) {
            vTaskDelay(pdMS_TO_TICKS(wait_us / 1000));
        }
    }

    /* Gateway đóng kết nối (người xem rời màn hình) → send lỗi → kết thúc. */
    int64_t secs = (esp_timer_get_time() - started) / 1000000;
    ESP_LOGI(TAG, "stream ended: %" PRIu32 " frames in %d s", frames, (int)secs);

    if (chunked) {
        httpd_resp_send_chunk(req, NULL, 0);   /* lỗi nếu socket đã đóng — bỏ qua */
    }
    httpd_req_async_handler_complete(req);
    cam_camera_stream_end();
    atomic_store(&s_busy, false);
    vTaskDelete(NULL);
}

static esp_err_t stream_handler(httpd_req_t *req)
{
    if (!cam_time_is_synced()) {
        return reply(req, "503 Service Unavailable", "clock not synced");
    }
    if (!authorized(req)) {
        return reply(req, "401 Unauthorized", "unauthorized");
    }
    framesize_t size;
    int quality;
    if (!parse_params(req, &size, &quality)) {
        return reply(req, "400 Bad Request", "fs=vga|qvga, q=10..30");
    }

    bool expected = false;
    if (!atomic_compare_exchange_strong(&s_busy, &expected, true)) {
        return reply(req, "409 Conflict", "stream already open");
    }

    stream_job_t *job = malloc(sizeof(*job));
    if (job == NULL || httpd_req_async_handler_begin(req, &job->req) != ESP_OK) {
        free(job);
        atomic_store(&s_busy, false);
        return reply(req, "500 Internal Server Error", "busy");
    }
    job->size = size;
    job->quality = quality;

    if (xTaskCreatePinnedToCore(stream_task, "stream", 4096, job, 5, NULL, 1) != pdPASS) {
        httpd_req_async_handler_complete(job->req);
        free(job);
        atomic_store(&s_busy, false);
        return reply(req, "500 Internal Server Error", "busy");
    }
    ESP_LOGI(TAG, "stream started (%s, q=%d)", size == FRAMESIZE_QVGA ? "qvga" : "vga", quality);
    return ESP_OK;
}

esp_err_t cam_stream_start(const cam_config_t *cfg)
{
    s_cfg = cfg;

    httpd_config_t hc = HTTPD_DEFAULT_CONFIG();
    hc.server_port = 80;
    hc.max_open_sockets = 3;   /* 1 luồng + chỗ trả 409/401 */
    hc.lru_purge_enable = true;
    hc.stack_size = 6144;

    httpd_handle_t server = NULL;
    esp_err_t err = httpd_start(&server, &hc);
    if (err != ESP_OK) {
        ESP_LOGE(TAG, "httpd start failed: %s", esp_err_to_name(err));
        return err;
    }
    const httpd_uri_t uri = {.uri = "/stream", .method = HTTP_GET, .handler = stream_handler};
    return httpd_register_uri_handler(server, &uri);
}
