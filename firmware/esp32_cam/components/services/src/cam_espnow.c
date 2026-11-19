#include "cam_espnow.h"

#include <string.h>

#include "cJSON.h"
#include "cam_time.h"
#include "cam_wifi.h"
#include "esp_app_desc.h"
#include "esp_log.h"
#include "esp_mac.h"
#include "esp_now.h"
#include "esp_random.h"
#include "esp_timer.h"
#include "espnow_proto.h"
#include "freertos/FreeRTOS.h"
#include "freertos/queue.h"
#include "freertos/semphr.h"
#include "freertos/task.h"
#include "sdkconfig.h"

static const char *TAG = "cam_espnow";

#define RX_QUEUE_LEN 8
#define PING_INTERVAL_US (5 * 1000 * 1000LL)
#define HEARTBEAT_INTERVAL_US ((int64_t)CONFIG_CAM_HEARTBEAT_INTERVAL_S * 1000 * 1000)
#define COMMAND_ID_MAX 64

typedef struct {
    uint8_t len;
    uint8_t data[ESPNOW_PROTO_MAX_LEN];
} rx_item_t;

static uint8_t s_gw_mac[6];
static QueueHandle_t s_rx_queue;
static SemaphoreHandle_t s_tx_lock;
static uint16_t s_tx_seq;
static bool s_have_rx_seq;
static uint16_t s_last_rx_seq;
static cam_espnow_cmd_cb_t s_on_cmd;
static bool s_ready;

/* ---- gửi ---------------------------------------------------------------------------------------------- */

static esp_err_t send_json(uint8_t type, cJSON *body)
{
    char json[ESPNOW_PROTO_MAX_BODY + 1];
    if (!cJSON_PrintPreallocated(body, json, sizeof(json), false)) {
        ESP_LOGW(TAG, "body too long for type 0x%02x", type);
        return ESP_ERR_INVALID_SIZE;
    }

    uint8_t frame[ESPNOW_PROTO_MAX_LEN];
    xSemaphoreTake(s_tx_lock, portMAX_DELAY);
    size_t len = espnow_proto_encode(frame, sizeof(frame), type, s_tx_seq++, json, strlen(json));
    esp_err_t err = (len > 0) ? esp_now_send(s_gw_mac, frame, len) : ESP_ERR_INVALID_SIZE;
    xSemaphoreGive(s_tx_lock);

    if (err != ESP_OK) {
        ESP_LOGW(TAG, "send type 0x%02x failed: %s", type, esp_err_to_name(err));
    }
    return err;
}

esp_err_t cam_espnow_send_event(const char *event, int64_t ts)
{
    if (!s_ready) {
        return ESP_ERR_INVALID_STATE;
    }
    cJSON *o = cJSON_CreateObject();
    cJSON_AddStringToObject(o, "event", event);
    cJSON_AddNumberToObject(o, "ts", (double)ts);
    esp_err_t err = send_json(ESPNOW_MSG_EVENT, o);
    cJSON_Delete(o);
    return err;
}

esp_err_t cam_espnow_send_cmd_ack(const char *command_id, bool ok)
{
    if (!s_ready) {
        return ESP_ERR_INVALID_STATE;
    }
    cJSON *o = cJSON_CreateObject();
    cJSON_AddStringToObject(o, "command_id", command_id);
    cJSON_AddStringToObject(o, "status", ok ? "ok" : "error");
    esp_err_t err = send_json(ESPNOW_MSG_CMD_ACK, o);
    cJSON_Delete(o);
    return err;
}

static void send_ping(void)
{
    cJSON *o = cJSON_CreateObject();
    send_json(ESPNOW_MSG_PING, o);
    cJSON_Delete(o);
}

static void send_heartbeat(void)
{
    int rssi = 0;
    cam_wifi_rssi(&rssi);
    cJSON *o = cJSON_CreateObject();
    cJSON_AddNumberToObject(o, "uptime", (double)(esp_timer_get_time() / 1000000));
    cJSON_AddNumberToObject(o, "rssi", rssi);
    cJSON_AddStringToObject(o, "fw_version", esp_app_get_description()->version);
    send_json(ESPNOW_MSG_HEARTBEAT, o);
    cJSON_Delete(o);
}

/* ---- nhận --------------------------------------------------------------------------------------------- */

/* Chạy trong task WiFi: chỉ lọc nguồn và chép vào hàng đợi. */
static void on_recv(const esp_now_recv_info_t *info, const uint8_t *data, int len)
{
    if (info == NULL || data == NULL || len <= 0 || len > ESPNOW_PROTO_MAX_LEN) {
        return;
    }
    if (memcmp(info->src_addr, s_gw_mac, sizeof(s_gw_mac)) != 0) {
        return;   /* TODO: PAIR_REQUEST broadcast từ Gateway mới khi đang ở chế độ ghép nối */
    }
    rx_item_t item = {.len = (uint8_t)len};
    memcpy(item.data, data, (size_t)len);
    xQueueSend(s_rx_queue, &item, 0);   /* đầy thì bỏ gói, không chặn task WiFi */
}

static void on_sent(const uint8_t *mac, esp_now_send_status_t status)
{
    if (status != ESP_NOW_SEND_SUCCESS) {
        ESP_LOGD(TAG, "no MAC ack from gateway");
    }
}

static bool valid_command_id(const char *s)
{
    size_t n = strnlen(s, COMMAND_ID_MAX + 1);
    if (n == 0 || n > COMMAND_ID_MAX) {
        return false;
    }
    for (size_t i = 0; i < n; i++) {
        char c = s[i];
        bool ok = (c >= '0' && c <= '9') || (c >= 'a' && c <= 'z') || (c >= 'A' && c <= 'Z') || c == '-' || c == '_';
        if (!ok) {
            return false;
        }
    }
    return true;
}

static void handle_frame(const rx_item_t *item)
{
    espnow_frame_view_t f;
    if (!espnow_proto_decode(item->data, item->len, &f)) {
        ESP_LOGW(TAG, "drop malformed frame (%u bytes)", item->len);
        return;
    }
    if (s_have_rx_seq && f.seq == s_last_rx_seq) {
        return;   /* gói phát lại */
    }
    s_have_rx_seq = true;
    s_last_rx_seq = f.seq;

    cJSON *body = cJSON_ParseWithLength((const char *)f.body, f.body_len);
    if (body == NULL) {
        ESP_LOGW(TAG, "drop frame type 0x%02x: bad JSON", f.type);
        return;
    }

    switch (f.type) {
    case ESPNOW_MSG_TIME_SYNC: {
        const cJSON *ts = cJSON_GetObjectItemCaseSensitive(body, "ts");
        /* Chặn giá trị ngoài khoảng trước khi ép double → int64 (tránh hành vi không xác định). */
        if (cJSON_IsNumber(ts) && ts->valuedouble > 0 && ts->valuedouble < 4102444800.0) {
            cam_time_set_unix((int64_t)ts->valuedouble, "gateway");
        }
        break;
    }
    case ESPNOW_MSG_CMD: {
        const cJSON *id = cJSON_GetObjectItemCaseSensitive(body, "command_id");
        const cJSON *action = cJSON_GetObjectItemCaseSensitive(body, "action");
        if (!cJSON_IsString(id) || !valid_command_id(id->valuestring) || !cJSON_IsString(action)) {
            ESP_LOGW(TAG, "drop CMD: bad command_id/action");
            break;
        }
        ESP_LOGI(TAG, "CMD %s action=%s", id->valuestring, action->valuestring);
        if (s_on_cmd) {
            s_on_cmd(id->valuestring, action->valuestring);
        }
        break;
    }
    case ESPNOW_MSG_PAIR_REQUEST:
    case ESPNOW_MSG_PAIR_CHALLENGE:
    case ESPNOW_MSG_PAIR_RESULT:
        ESP_LOGW(TAG, "pairing frame 0x%02x not implemented yet", f.type);
        break;
    default:
        ESP_LOGD(TAG, "ignore frame type 0x%02x", f.type);
        break;
    }
    cJSON_Delete(body);
}

static void espnow_task(void *arg)
{
    int64_t last_ping = 0;
    int64_t last_hb = 0;
    rx_item_t item;

    for (;;) {
        if (xQueueReceive(s_rx_queue, &item, pdMS_TO_TICKS(1000)) == pdTRUE) {
            handle_frame(&item);
        }

        /* Chưa nối Local AP thì chưa biết kênh — không gửi. */
        if (!cam_wifi_is_connected()) {
            continue;
        }
        int64_t now = esp_timer_get_time();
        if (!cam_time_is_synced() && now - last_ping >= PING_INTERVAL_US) {
            last_ping = now;
            send_ping();   /* Gateway trả TIME_SYNC */
        }
        if (last_hb == 0 || now - last_hb >= HEARTBEAT_INTERVAL_US) {
            last_hb = now;
            send_heartbeat();
        }
    }
}

esp_err_t cam_espnow_start(const cam_config_t *cfg, cam_espnow_cmd_cb_t on_cmd)
{
    if (!cfg->has_gateway_mac) {
        ESP_LOGW(TAG, "no pairing/gateway_mac — ESP-NOW disabled");
        return ESP_ERR_INVALID_STATE;
    }

    esp_now_peer_info_t peer = {0};
    memcpy(peer.peer_addr, cfg->gateway_mac, sizeof(peer.peer_addr));
    peer.channel = 0;            /* kênh hiện tại của STA = kênh Local AP */
    peer.ifidx = WIFI_IF_STA;
    if (cfg->has_lmk) {
        peer.encrypt = true;
        memcpy(peer.lmk, cfg->lmk, sizeof(peer.lmk));
    } else {
#if defined(CONFIG_CAM_ESPNOW_ALLOW_UNENCRYPTED)
        ESP_LOGW(TAG, "DEV: ESP-NOW peer WITHOUT encryption — disable for demo/production");
        peer.encrypt = false;
#else
        ESP_LOGE(TAG, "no pairing/session_key — refusing unencrypted ESP-NOW");
        return ESP_ERR_INVALID_STATE;
#endif
    }

    memcpy(s_gw_mac, cfg->gateway_mac, sizeof(s_gw_mac));
    s_on_cmd = on_cmd;
    s_tx_seq = (uint16_t)(esp_random() & 0xffff);   /* sau reset không trùng seq cũ → Gateway không bỏ nhầm */
    s_rx_queue = xQueueCreate(RX_QUEUE_LEN, sizeof(rx_item_t));
    s_tx_lock = xSemaphoreCreateMutex();
    if (s_rx_queue == NULL || s_tx_lock == NULL) {
        return ESP_ERR_NO_MEM;
    }

    ESP_ERROR_CHECK(esp_now_init());
    /* TODO: PMK chung (esp_now_set_pmk) chốt cùng luồng ghép nối; hiện dùng PMK mặc định của ESP-IDF. */
    ESP_ERROR_CHECK(esp_now_register_recv_cb(on_recv));
    ESP_ERROR_CHECK(esp_now_register_send_cb(on_sent));
    esp_err_t err = esp_now_add_peer(&peer);
    memset(&peer, 0, sizeof(peer));   /* xoá bản sao LMK trên stack */
    if (err != ESP_OK) {
        ESP_LOGE(TAG, "add gateway peer failed: %s", esp_err_to_name(err));
        return err;
    }

    if (xTaskCreatePinnedToCore(espnow_task, "espnow", 4096, NULL, 5, NULL, 0) != pdPASS) {
        return ESP_ERR_NO_MEM;
    }
    s_ready = true;
    ESP_LOGI(TAG, "ESP-NOW ready, gateway " MACSTR "%s", MAC2STR(s_gw_mac), cfg->has_lmk ? " (encrypted)" : "");
    return ESP_OK;
}

bool cam_espnow_ready(void)
{
    return s_ready;
}
