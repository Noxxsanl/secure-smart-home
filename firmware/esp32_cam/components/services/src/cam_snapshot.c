#include "cam_snapshot.h"

#include <inttypes.h>
#include <stdio.h>
#include <string.h>

#include "cam_camera.h"
#include "cam_time.h"
#include "cam_wifi.h"
#include "esp_heap_caps.h"
#include "esp_http_client.h"
#include "esp_log.h"
#include "freertos/FreeRTOS.h"
#include "freertos/queue.h"
#include "freertos/task.h"
#include "sdkconfig.h"
#include "security_manager.h"

static const char *TAG = "cam_snapshot";

#define QUEUE_LEN 4
#define COMMAND_ID_MAX 64

typedef struct {
    cam_trigger_t trigger;
    char command_id[COMMAND_ID_MAX + 1];   /* "" = không theo lệnh */
} snapshot_req_t;

static const cam_config_t *s_cfg;
static cam_snapshot_done_cb_t s_on_done;
static QueueHandle_t s_queue;
static uint8_t *s_jpeg;   /* bộ đệm 200 KB trong PSRAM, chỉ task này dùng */

static esp_err_t upload(const uint8_t *jpeg, size_t len, const snapshot_req_t *req)
{
    char gw_ip[16];
    int64_t ts;
    if (!cam_wifi_gateway_ip(gw_ip, sizeof(gw_ip))) {
        ESP_LOGW(TAG, "not connected to local AP");
        return ESP_ERR_INVALID_STATE;
    }
    if (!cam_time_now(&ts)) {
        ESP_LOGW(TAG, "clock not synced, cannot sign");
        return ESP_ERR_INVALID_STATE;
    }

    char ts_str[24];
    char sig[SM_HMAC_HEX_LEN + 1];
    snprintf(ts_str, sizeof(ts_str), "%" PRId64, ts);
    esp_err_t err = sm_device_sign(s_cfg->device_secret, s_cfg->device_id, ts, sig);
    if (err != ESP_OK) {
        return err;
    }

    char url[64];
    snprintf(url, sizeof(url), "http://%s:%d/local/camera/snapshot", gw_ip, CONFIG_CAM_GATEWAY_HTTP_PORT);
    esp_http_client_config_t hc = {
        .url = url,
        .method = HTTP_METHOD_POST,
        .timeout_ms = CONFIG_CAM_UPLOAD_TIMEOUT_MS,
        .disable_auto_redirect = true,
    };
    esp_http_client_handle_t client = esp_http_client_init(&hc);
    if (client == NULL) {
        return ESP_ERR_NO_MEM;
    }
    esp_http_client_set_header(client, "Content-Type", "image/jpeg");
    esp_http_client_set_header(client, "X-Device-Id", s_cfg->device_id);
    esp_http_client_set_header(client, "X-Timestamp", ts_str);
    esp_http_client_set_header(client, "X-Signature", sig);
    esp_http_client_set_header(client, "X-Trigger", req->trigger == CAM_TRIGGER_MOTION ? "motion" : "request");
    if (req->command_id[0] != '\0') {
        esp_http_client_set_header(client, "X-Command-Id", req->command_id);
    }
    esp_http_client_set_post_field(client, (const char *)jpeg, (int)len);

    err = esp_http_client_perform(client);
    int status = esp_http_client_get_status_code(client);
    esp_http_client_cleanup(client);

    if (err != ESP_OK) {
        ESP_LOGW(TAG, "upload failed: %s", esp_err_to_name(err));
        return err;
    }
    if (status != 201) {
        /* 401: sai secret/lệch giờ; 413: ảnh quá lớn (xem README §Xử lý sự cố) */
        ESP_LOGW(TAG, "gateway rejected snapshot: HTTP %d", status);
        return ESP_FAIL;
    }
    ESP_LOGI(TAG, "snapshot sent (%u bytes, %s)", (unsigned)len,
             req->trigger == CAM_TRIGGER_MOTION ? "motion" : "request");
    return ESP_OK;
}

static void snapshot_task(void *arg)
{
    snapshot_req_t req;
    for (;;) {
        if (xQueueReceive(s_queue, &req, portMAX_DELAY) != pdTRUE) {
            continue;
        }
        size_t len = 0;
        esp_err_t err = cam_camera_capture_copy(s_jpeg, CAM_SNAPSHOT_MAX_BYTES, &len);
        if (err == ESP_OK) {
            err = upload(s_jpeg, len, &req);
        }
        /* TODO: mất kết nối Gateway thì giữ ảnh gần nhất, gửi lại khi nối lại (IOT_NODE_NETWORK §7). */
        if (req.command_id[0] != '\0' && s_on_done) {
            s_on_done(req.command_id, err == ESP_OK);
        }
    }
}

esp_err_t cam_snapshot_start(const cam_config_t *cfg, cam_snapshot_done_cb_t on_done)
{
    s_cfg = cfg;
    s_on_done = on_done;
    s_jpeg = heap_caps_malloc(CAM_SNAPSHOT_MAX_BYTES, MALLOC_CAP_SPIRAM | MALLOC_CAP_8BIT);
    s_queue = xQueueCreate(QUEUE_LEN, sizeof(snapshot_req_t));
    if (s_jpeg == NULL || s_queue == NULL) {
        ESP_LOGE(TAG, "out of memory (PSRAM enabled?)");
        return ESP_ERR_NO_MEM;
    }
    if (xTaskCreatePinnedToCore(snapshot_task, "snapshot", 6144, NULL, 5, NULL, 1) != pdPASS) {
        return ESP_ERR_NO_MEM;
    }
    return ESP_OK;
}

bool cam_snapshot_request(cam_trigger_t trigger, const char *command_id)
{
    if (s_queue == NULL) {
        return false;
    }
    snapshot_req_t req = {.trigger = trigger};
    if (command_id != NULL) {
        strlcpy(req.command_id, command_id, sizeof(req.command_id));
    }
    if (xQueueSend(s_queue, &req, 0) != pdTRUE) {
        ESP_LOGW(TAG, "queue full, drop snapshot request");
        return false;
    }
    return true;
}
