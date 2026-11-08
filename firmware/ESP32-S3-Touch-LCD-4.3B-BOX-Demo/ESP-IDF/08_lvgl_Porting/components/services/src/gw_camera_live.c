#include "gw_camera_live.h"

#include <inttypes.h>
#include <stdatomic.h>
#include <stdio.h>
#include <string.h>
#include <strings.h>

#include "esp_check.h"
#include "esp_heap_caps.h"
#include "esp_http_client.h"
#include "esp_log.h"
#include "esp_timer.h"
#include "freertos/FreeRTOS.h"
#include "freertos/task.h"
#include "gw_registry.h"
#include "gw_time.h"
#include "gw_wifi.h"
#include "sdkconfig.h"

static const char *TAG = "gw_camera_live";

#if CONFIG_GW_CAMERA_LIVE_FS_QVGA
#define LIVE_FS "qvga"
#else
#define LIVE_FS "vga"
#endif

#define LIVE_TASK_STACK 8192      /* esp_http_client + callback giải nén/LVGL chạy trên stack này */
#define LIVE_TASK_PRIO 1          /* dưới task LVGL (2): giải nén không làm giật giao diện */
#define LIVE_TASK_CORE 1          /* IOT_NODE_NETWORK §5.4: giải nén ở nhân 1, nhân 0 cho WiFi/ESP-NOW/MQTT */
#define LIVE_HTTP_TIMEOUT_MS 3000
#define LIVE_HTTP_RX_BUF 4096
#define LIVE_RETRY_MAX 3          /* thử lại sau 1, 2, 4 s (§5.4) */
#define LIVE_YIELD_MS 2           /* nhường IDLE1 sau mỗi khung — task watchdog canh IDLE của cả 2 nhân */
#define PART_HDR_MAX 256
#define PART_HDR_READ 64          /* đọc header từng ít một để không chờ sang khung sau */
#define CLEN_DIGITS_MAX 7
#define RD_BUF 2048

/* Đọc thân HTTP (esp_http_client đã bỏ lớp chunked) — chỉ task gw_live dùng. */
typedef struct {
    esp_http_client_handle_t client;
    uint8_t buf[RD_BUF];
    size_t pos, len;
} reader_t;

static gw_camera_live_callbacks_t s_cbs;
static TaskHandle_t s_task;
static atomic_int s_want = -1;   /* camera đang được yêu cầu, -1 = dừng */
static uint8_t *s_frame;          /* PSRAM, GW_CAMERA_LIVE_FRAME_MAX */
static reader_t s_rd;

static void emit(int idx, gw_live_state_t st, gw_live_err_t err, int http_status)
{
    if (s_cbs.on_state) {
        s_cbs.on_state((size_t)idx, st, err, http_status, s_cbs.ctx);
    }
}

static bool still_wanted(int idx)
{
    return atomic_load(&s_want) == idx;
}

/* ---- tách khung khỏi multipart/x-mixed-replace ---------------------------------------------------------- */

static bool rd_fill(reader_t *r, size_t want)
{
    if (want > sizeof(r->buf)) {
        want = sizeof(r->buf);
    }
    /* esp_http_client_read chờ đủ `want` byte (hoặc hết thời gian / đóng kết nối). */
    int n = esp_http_client_read(r->client, (char *)r->buf, (int)want);
    if (n <= 0) {
        return false;
    }
    r->pos = 0;
    r->len = (size_t)n;
    return true;
}

/* Đọc đúng n byte vào dst; dst = NULL thì bỏ qua n byte. Không đọc lố sang khung sau. */
static bool rd_exact(reader_t *r, uint8_t *dst, size_t n)
{
    while (n > 0) {
        if (r->pos < r->len) {
            size_t k = r->len - r->pos;
            if (k > n) {
                k = n;
            }
            if (dst != NULL) {
                memcpy(dst, r->buf + r->pos, k);
                dst += k;
            }
            r->pos += k;
            n -= k;
        } else if (dst != NULL) {
            int got = esp_http_client_read(r->client, (char *)dst, (int)n);   /* thẳng vào bộ đệm khung */
            if (got <= 0) {
                return false;
            }
            dst += got;
            n -= (size_t)got;
        } else if (!rd_fill(r, n)) {
            return false;
        }
    }
    return true;
}

static const char *find_ci(const char *hay, const char *needle)
{
    size_t n = strlen(needle);
    for (; *hay != '\0'; hay++) {
        if (strncasecmp(hay, needle, n) == 0) {
            return hay;
        }
    }
    return NULL;
}

/*
 * Đọc header của phần tiếp theo tới dòng trống, trả Content-Length.
 * Camera gửi mỗi khung: "\r\n--<boundary>\r\nContent-Type: image/jpeg\r\nContent-Length: <n>\r\n\r\n" + JPEG.
 */
static bool rd_part_header(reader_t *r, size_t *content_len)
{
    char hdr[PART_HDR_MAX + 1];
    size_t n = 0;
    for (;;) {
        if (r->pos == r->len && !rd_fill(r, PART_HDR_READ)) {
            return false;
        }
        if (n >= PART_HDR_MAX) {
            ESP_LOGW(TAG, "part header longer than %d bytes — not our camera stream?", PART_HDR_MAX);
            return false;
        }
        hdr[n++] = (char)r->buf[r->pos++];
        if (n >= 4 && memcmp(hdr + n - 4, "\r\n\r\n", 4) == 0) {
            break;
        }
    }
    hdr[n] = '\0';

    const char *p = find_ci(hdr, "content-length:");
    if (p == NULL) {
        ESP_LOGW(TAG, "part without Content-Length");
        return false;
    }
    p += strlen("content-length:");
    while (*p == ' ' || *p == '\t') {
        p++;
    }
    size_t v = 0;
    int digits = 0;
    for (; *p >= '0' && *p <= '9'; p++) {
        if (++digits > CLEN_DIGITS_MAX) {
            return false;
        }
        v = v * 10 + (size_t)(*p - '0');
    }
    if (digits == 0) {
        return false;
    }
    *content_len = v;
    return true;
}

static gw_live_err_t err_from_status(int status)
{
    switch (status) {
    case 401:
        return GW_LIVE_ERR_AUTH;
    case 409:
        return GW_LIVE_ERR_BUSY;
    case 503:
        return GW_LIVE_ERR_CAM_NO_TIME;
    default:
        return GW_LIVE_ERR_HTTP;
    }
}

/* 1 phiên GET /stream: trả khi luồng đứt, bị từ chối, hoặc không còn được yêu cầu. */
static gw_live_err_t run_stream(int idx, int *http_status, uint32_t *frames)
{
    *http_status = 0;
    *frames = 0;
    const gw_device_info_t *dev = gw_registry_get((size_t)idx);
    if (dev == NULL || dev->kind != GW_DEV_CAMERA) {
        return GW_LIVE_ERR_NOT_ON_AP;
    }

    esp_ip4_addr_t ip;
    if (!gw_wifi_ap_client_ip(dev->mac, &ip)) {
        ESP_LOGW(TAG, "camera %s is not on the local AP", dev->device_id);
        return GW_LIVE_ERR_NOT_ON_AP;
    }
    int64_t now;
    if (!gw_time_now(&now)) {
        ESP_LOGW(TAG, "gateway clock not synced — cannot sign stream request");
        return GW_LIVE_ERR_NO_TIME;
    }
    char ts_str[24];
    char sig[SM_HMAC_HEX_LEN + 1];
    snprintf(ts_str, sizeof(ts_str), "%" PRId64, now);
    if (gw_registry_sign((size_t)idx, now, sig) != ESP_OK) {
        return GW_LIVE_ERR_CONNECT;
    }

    char url[80];
    snprintf(url, sizeof(url), "http://" IPSTR "/stream?fs=" LIVE_FS "&q=%d", IP2STR(&ip),
             CONFIG_GW_CAMERA_LIVE_QUALITY);
    const esp_http_client_config_t hc = {
        .url = url,
        .method = HTTP_METHOD_GET,
        .timeout_ms = LIVE_HTTP_TIMEOUT_MS,
        .buffer_size = LIVE_HTTP_RX_BUF,
        .disable_auto_redirect = true,
        .keep_alive_enable = false,
    };
    esp_http_client_handle_t client = esp_http_client_init(&hc);
    if (client == NULL) {
        return GW_LIVE_ERR_CONNECT;
    }
    esp_http_client_set_header(client, "X-Device-Id", dev->device_id);
    esp_http_client_set_header(client, "X-Timestamp", ts_str);
    esp_http_client_set_header(client, "X-Signature", sig);

    gw_live_err_t result;
    esp_err_t err = esp_http_client_open(client, 0);
    if (err != ESP_OK) {
        ESP_LOGW(TAG, "connect to camera %s (" IPSTR ") failed: %s", dev->device_id, IP2STR(&ip), esp_err_to_name(err));
        result = GW_LIVE_ERR_CONNECT;
        goto done;
    }
    if (esp_http_client_fetch_headers(client) < 0) {
        ESP_LOGW(TAG, "camera %s: no HTTP response", dev->device_id);
        result = GW_LIVE_ERR_CONNECT;
        goto done;
    }
    int status = esp_http_client_get_status_code(client);
    *http_status = status;
    if (status != 200) {
        /* 401 sai secret / lệch giờ · 409 đang có luồng khác · 503 camera chưa có giờ (cam_stream.h) */
        ESP_LOGW(TAG, "camera %s refused stream: HTTP %d", dev->device_id, status);
        result = err_from_status(status);
        goto done;
    }
    ESP_LOGI(TAG, "streaming from camera %s (" IPSTR ", " LIVE_FS ", q=%d)", dev->device_id, IP2STR(&ip),
             CONFIG_GW_CAMERA_LIVE_QUALITY);

    s_rd.client = client;
    s_rd.pos = s_rd.len = 0;
    int64_t started_us = esp_timer_get_time();
    while (still_wanted(idx)) {
        size_t len = 0;
        if (!rd_part_header(&s_rd, &len)) {
            break;
        }
        if (len == 0 || len > GW_CAMERA_LIVE_FRAME_MAX) {
            ESP_LOGW(TAG, "skip part of %u bytes (limit %d)", (unsigned)len, GW_CAMERA_LIVE_FRAME_MAX);
            if (!rd_exact(&s_rd, NULL, len)) {
                break;
            }
            continue;
        }
        if (!rd_exact(&s_rd, s_frame, len)) {
            break;
        }
        if (len < 4 || s_frame[0] != 0xFF || s_frame[1] != 0xD8) {
            ESP_LOGW(TAG, "part is not a JPEG — dropped");
            continue;
        }
        if (++*frames == 1) {
            emit(idx, GW_LIVE_STREAMING, GW_LIVE_ERR_NONE, status);
        }
        if (s_cbs.on_frame) {
            s_cbs.on_frame((size_t)idx, s_frame, len, s_cbs.ctx);
        }
        vTaskDelay(pdMS_TO_TICKS(LIVE_YIELD_MS));
    }
    int secs = (int)((esp_timer_get_time() - started_us) / 1000000);
    ESP_LOGI(TAG, "stream from camera %s ended: %" PRIu32 " frames in %d s", dev->device_id, *frames, secs);
    result = still_wanted(idx) ? GW_LIVE_ERR_STREAM : GW_LIVE_ERR_NONE;

done:
    s_rd.client = NULL;
    esp_http_client_close(client);   /* camera thấy socket đóng → ngừng phát, trả độ phân giải chụp ảnh */
    esp_http_client_cleanup(client);
    return result;
}

/* Chờ ms, ra sớm nếu yêu cầu đổi (dừng hoặc chuyển camera). */
static void backoff(int idx, uint32_t ms)
{
    const TickType_t end = xTaskGetTickCount() + pdMS_TO_TICKS(ms);
    while (still_wanted(idx)) {
        TickType_t left = end - xTaskGetTickCount();
        if ((int32_t)left <= 0) {
            break;
        }
        ulTaskNotifyTake(pdTRUE, left);
    }
}

static void live_task(void *arg)
{
    for (;;) {
        int idx = atomic_load(&s_want);
        if (idx < 0) {
            ulTaskNotifyTake(pdTRUE, portMAX_DELAY);
            continue;
        }
        emit(idx, GW_LIVE_CONNECTING, GW_LIVE_ERR_NONE, 0);
        int failures = 0;
        bool failed = false;
        while (still_wanted(idx)) {
            int http_status;
            uint32_t frames;
            gw_live_err_t err = run_stream(idx, &http_status, &frames);
            if (!still_wanted(idx)) {
                break;
            }
            if (frames > 0) {
                failures = 0;   /* luồng đã chạy rồi mới đứt → đếm lại từ đầu */
            }
            if (++failures > LIVE_RETRY_MAX) {
                int expected = idx;
                atomic_compare_exchange_strong(&s_want, &expected, -1);   /* không xoá yêu cầu camera khác */
                ESP_LOGW(TAG, "giving up camera stream after %d attempts", LIVE_RETRY_MAX + 1);
                emit(idx, GW_LIVE_FAILED, err, http_status);
                failed = true;
                break;
            }
            emit(idx, GW_LIVE_RETRYING, err, http_status);
            backoff(idx, 1000u << (failures - 1));   /* 1, 2, 4 s */
        }
        if (!failed) {
            emit(idx, GW_LIVE_STOPPED, GW_LIVE_ERR_NONE, 0);
        }
    }
}

esp_err_t gw_camera_live_init(const gw_camera_live_callbacks_t *cbs)
{
    ESP_RETURN_ON_FALSE(cbs != NULL, ESP_ERR_INVALID_ARG, TAG, "null callbacks");
    ESP_RETURN_ON_FALSE(s_task == NULL, ESP_ERR_INVALID_STATE, TAG, "already started");
    s_cbs = *cbs;
    s_frame = heap_caps_malloc(GW_CAMERA_LIVE_FRAME_MAX, MALLOC_CAP_SPIRAM | MALLOC_CAP_8BIT);
    ESP_RETURN_ON_FALSE(s_frame != NULL, ESP_ERR_NO_MEM, TAG, "frame buffer (PSRAM)");
    if (xTaskCreatePinnedToCore(live_task, "gw_live", LIVE_TASK_STACK, NULL, LIVE_TASK_PRIO, &s_task,
                                LIVE_TASK_CORE) != pdPASS) {
        free(s_frame);
        s_frame = NULL;
        return ESP_ERR_NO_MEM;
    }
    ESP_LOGI(TAG, "ready (GET /stream?fs=" LIVE_FS "&q=%d)", CONFIG_GW_CAMERA_LIVE_QUALITY);
    return ESP_OK;
}

esp_err_t gw_camera_live_start(size_t cam_idx)
{
    ESP_RETURN_ON_FALSE(s_task != NULL, ESP_ERR_INVALID_STATE, TAG, "not initialised");
    const gw_device_info_t *dev = gw_registry_get(cam_idx);
    ESP_RETURN_ON_FALSE(dev != NULL && dev->kind == GW_DEV_CAMERA, ESP_ERR_INVALID_ARG, TAG, "not a camera");
    atomic_store(&s_want, (int)cam_idx);
    xTaskNotifyGive(s_task);
    return ESP_OK;
}

void gw_camera_live_stop(void)
{
    if (s_task == NULL) {
        return;
    }
    atomic_store(&s_want, -1);
    xTaskNotifyGive(s_task);
}

bool gw_camera_live_active(void)
{
    return atomic_load(&s_want) >= 0;
}
