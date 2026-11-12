#include "gw_espnow.h"

#include <inttypes.h>
#include <math.h>
#include <stdio.h>
#include <string.h>

#include "cJSON.h"
#include "esp_check.h"
#include "esp_log.h"
#include "esp_mac.h"
#include "esp_now.h"
#include "esp_random.h"
#include "esp_wifi.h"
#include "espnow_proto.h"
#include "freertos/FreeRTOS.h"
#include "freertos/queue.h"
#include "freertos/semphr.h"
#include "freertos/task.h"
#include "gw_config.h"
#include "gw_registry.h"
#include "gw_time.h"
#include "gw_wifi.h"
#include "mbedtls/platform_util.h"
#include "sdkconfig.h"

static const char *TAG = "gw_espnow";

#define RX_QUEUE_LEN 16
#define SEND_ACK_TIMEOUT_MS 100
#define TASK_STACK 6144
#define SEQ_HISTORY 8
#define COMMAND_ID_MAX 64
#define ACTION_MAX 32
#define EVENT_MAX 32
#define TS_MAX_VALID 4102444800.0   /* 2100-01-01 */

typedef struct {
    uint8_t src[6];
    int8_t rssi;
    uint8_t len;
    uint8_t data[ESPNOW_PROTO_MAX_LEN];
} rx_item_t;

typedef struct {
    bool peer_ok;                 /* đã thêm peer (mã hoá, hoặc [DEV] không mã hoá) */
    uint16_t seq_hist[SEQ_HISTORY];
    size_t seq_count;
    size_t seq_next;
    int64_t last_telemetry_ts;
} peer_state_t;

static gw_espnow_callbacks_t s_cbs;
static QueueHandle_t s_rx_queue;
static SemaphoreHandle_t s_tx_lock;
static SemaphoreHandle_t s_sent_sem;
static volatile bool s_last_send_ok;
static uint16_t s_tx_seq;
static peer_state_t s_peers[GW_REGISTRY_MAX];   /* chỉ task gw_espnow ghi (peer_ok ghi trước khi tạo task) */

/* ---- tiện ích ----------------------------------------------------------------------------------------- */

/* Số nguyên unix hợp lệ trong JSON (cJSON lưu double). */
static bool json_unix_ts(const cJSON *n, int64_t *out)
{
    if (!cJSON_IsNumber(n) || n->valuedouble <= 0 || n->valuedouble >= TS_MAX_VALID ||
        floor(n->valuedouble) != n->valuedouble) {
        return false;
    }
    *out = (int64_t)n->valuedouble;
    return true;
}

static bool seq_seen(peer_state_t *p, uint16_t seq)
{
    for (size_t i = 0; i < p->seq_count; i++) {
        if (p->seq_hist[i] == seq) {
            return true;
        }
    }
    p->seq_hist[p->seq_next] = seq;
    p->seq_next = (p->seq_next + 1) % SEQ_HISTORY;
    if (p->seq_count < SEQ_HISTORY) {
        p->seq_count++;
    }
    return false;
}

static const char *verify_reason(sm_verify_result_t r)
{
    switch (r) {
    case SM_VERIFY_EXPIRED:
        return "timestamp outside ±300 s";
    case SM_VERIFY_MISMATCH:
        return "HMAC mismatch";
    default:
        return "malformed signature";
    }
}

/* ---- gửi ---------------------------------------------------------------------------------------------- */

/* Gửi 1 khung và chờ ack tầng MAC. Mọi lần gửi đi qua đây (ESP-NOW không nên gửi chồng). */
static esp_err_t send_frame(size_t idx, uint8_t type, const char *body, size_t len)
{
    const gw_device_info_t *dev = gw_registry_get(idx);
    if (dev == NULL || !s_peers[idx].peer_ok) {
        return ESP_ERR_INVALID_STATE;
    }
    uint8_t frame[ESPNOW_PROTO_MAX_LEN];
    esp_err_t err;

    xSemaphoreTake(s_tx_lock, portMAX_DELAY);
    size_t n = espnow_proto_encode(frame, sizeof(frame), type, s_tx_seq++, body, len);
    if (n == 0) {
        err = ESP_ERR_INVALID_SIZE;
    } else {
        xSemaphoreTake(s_sent_sem, 0);   /* bỏ tín hiệu cũ của lần gửi đã hết giờ */
        err = esp_now_send(dev->mac, frame, n);
        if (err == ESP_OK &&
            (xSemaphoreTake(s_sent_sem, pdMS_TO_TICKS(SEND_ACK_TIMEOUT_MS)) != pdTRUE || !s_last_send_ok)) {
            err = ESP_FAIL;
        }
    }
    xSemaphoreGive(s_tx_lock);

    if (err != ESP_OK) {
        ESP_LOGD(TAG, "send type 0x%02x to %s: %s", type, dev->device_id, esp_err_to_name(err));
    }
    return err;
}

esp_err_t gw_espnow_send_time_sync(size_t idx)
{
    int64_t now;
    if (!gw_time_now(&now)) {
        return ESP_ERR_INVALID_STATE;
    }
    char body[32];
    int n = snprintf(body, sizeof(body), "{\"ts\":%" PRId64 "}", now);
    return send_frame(idx, ESPNOW_MSG_TIME_SYNC, body, (size_t)n);
}

esp_err_t gw_espnow_send_cmd(size_t idx, const char *command_id, const char *action, const char *target, int64_t ts)
{
    ESP_RETURN_ON_FALSE(gw_valid_id(command_id, COMMAND_ID_MAX), ESP_ERR_INVALID_ARG, TAG, "bad command_id");
    ESP_RETURN_ON_FALSE(gw_valid_token(action, ACTION_MAX), ESP_ERR_INVALID_ARG, TAG, "bad action");
    ESP_RETURN_ON_FALSE(target == NULL || gw_valid_token(target, ACTION_MAX), ESP_ERR_INVALID_ARG, TAG, "bad target");
    /* Chuỗi đã kiểm ký tự nên ghép thẳng vào JSON được. ts để node kiểm cửa sổ ±30 s (chống phát lại). */
    char body[ESPNOW_PROTO_MAX_BODY + 1];
    int n = target == NULL
                ? snprintf(body, sizeof(body), "{\"command_id\":\"%s\",\"action\":\"%s\",\"ts\":%" PRId64 "}",
                           command_id, action, ts)
                : snprintf(body, sizeof(body),
                           "{\"command_id\":\"%s\",\"action\":\"%s\",\"params\":{\"target\":\"%s\"},\"ts\":%" PRId64 "}",
                           command_id, action, target, ts);
    ESP_RETURN_ON_FALSE(n > 0 && (size_t)n < sizeof(body), ESP_ERR_INVALID_SIZE, TAG, "CMD too long");
    return send_frame(idx, ESPNOW_MSG_CMD, body, (size_t)n);
}

/* ---- nhận --------------------------------------------------------------------------------------------- */

/* Chạy trong task WiFi: chỉ lọc nguồn và chép vào hàng đợi, không xử lý nặng. */
static void on_recv(const esp_now_recv_info_t *info, const uint8_t *data, int len)
{
    if (info == NULL || data == NULL || len <= 0 || len > ESPNOW_PROTO_MAX_LEN) {
        return;
    }
    int idx = gw_registry_find_mac(info->src_addr);
    if (idx < 0 || !s_peers[idx].peer_ok) {
        return;   /* MAC lạ — TODO: PAIR_REQUEST khi Gateway ở chế độ ghép nối (WiFi Provisioning §9.1) */
    }
    rx_item_t item = {
        .rssi = info->rx_ctrl ? (int8_t)info->rx_ctrl->rssi : 0,
        .len = (uint8_t)len,
    };
    memcpy(item.src, info->src_addr, sizeof(item.src));
    memcpy(item.data, data, (size_t)len);
    xQueueSend(s_rx_queue, &item, 0);   /* đầy thì bỏ gói, không chặn task WiFi */
}

static void on_sent(const uint8_t *mac, esp_now_send_status_t status)
{
    s_last_send_ok = (status == ESP_NOW_SEND_SUCCESS);
    xSemaphoreGive(s_sent_sem);
}

static void handle_telemetry(size_t idx, const espnow_frame_view_t *f, const cJSON *body)
{
    const gw_device_info_t *dev = gw_registry_get(idx);
    if (dev->kind != GW_DEV_NODE) {
        ESP_LOGW(TAG, "drop TELEMETRY from %s: not a node", dev->device_id);
        return;
    }
    const cJSON *sid = cJSON_GetObjectItemCaseSensitive(body, "sensor_id");
    const cJSON *jts = cJSON_GetObjectItemCaseSensitive(body, "sn_timestamp");
    const cJSON *sig = cJSON_GetObjectItemCaseSensitive(body, "sn_hmac");
    const cJSON *data = cJSON_GetObjectItemCaseSensitive(body, "data");
    int64_t ts;

    if (!cJSON_IsString(sid) || !json_unix_ts(jts, &ts) || !cJSON_IsString(sig) || !cJSON_IsObject(data) ||
        data->child == NULL) {
        ESP_LOGW(TAG, "drop TELEMETRY from %s: missing sensor_id/sn_timestamp/sn_hmac/data", dev->device_id);
        return;
    }
    /* Gắn danh tính với MAC: gói từ MAC của node A không được mang sensor_id của node B. */
    if (strcmp(sid->valuestring, dev->device_id) != 0) {
        ESP_LOGW(TAG, "drop TELEMETRY from %s: sensor_id does not match paired device", dev->device_id);
        return;
    }
    int64_t now;
    if (!gw_time_now(&now)) {
        ESP_LOGW(TAG, "drop TELEMETRY from %s: gateway clock not synced, cannot verify", dev->device_id);
        return;
    }
    sm_verify_result_t r = gw_registry_verify(idx, ts, sig->valuestring, now);
    if (r != SM_VERIFY_OK) {
        ESP_LOGW(TAG, "drop TELEMETRY from %s: %s", dev->device_id, verify_reason(r));
        return;
    }
    if (ts < s_peers[idx].last_telemetry_ts) {
        ESP_LOGW(TAG, "drop TELEMETRY from %s: sn_timestamp older than previous (replay?)", dev->device_id);
        return;
    }
    s_peers[idx].last_telemetry_ts = ts;
    ESP_LOGI(TAG, "TELEMETRY %s verified (ts %" PRId64 ")", dev->device_id, ts);
    if (s_cbs.on_telemetry) {
        s_cbs.on_telemetry(idx, (const char *)f->body, f->body_len, s_cbs.ctx);
    }
}

static void handle_event(size_t idx, const cJSON *body)
{
    const gw_device_info_t *dev = gw_registry_get(idx);
    const cJSON *ev = cJSON_GetObjectItemCaseSensitive(body, "event");
    const cJSON *jts = cJSON_GetObjectItemCaseSensitive(body, "ts");
    int64_t ts;
    if (!cJSON_IsString(ev) || !gw_valid_token(ev->valuestring, EVENT_MAX) || !json_unix_ts(jts, &ts)) {
        ESP_LOGW(TAG, "drop EVENT from %s: bad event/ts", dev->device_id);
        return;
    }
    ESP_LOGI(TAG, "EVENT %s from %s", ev->valuestring, dev->device_id);
    if (s_cbs.on_event) {
        s_cbs.on_event(idx, ev->valuestring, ts, s_cbs.ctx);
    }
}

static void handle_cmd_ack(size_t idx, const cJSON *body)
{
    const gw_device_info_t *dev = gw_registry_get(idx);
    const cJSON *id = cJSON_GetObjectItemCaseSensitive(body, "command_id");
    const cJSON *status = cJSON_GetObjectItemCaseSensitive(body, "status");
    const cJSON *power = cJSON_GetObjectItemCaseSensitive(body, "power");
    if (!cJSON_IsString(id) || !gw_valid_id(id->valuestring, COMMAND_ID_MAX) || !cJSON_IsString(status)) {
        ESP_LOGW(TAG, "drop CMD_ACK from %s: bad command_id/status", dev->device_id);
        return;
    }
    bool ok = strcmp(status->valuestring, "ok") == 0;
    if (!ok && strcmp(status->valuestring, "error") != 0) {
        ESP_LOGW(TAG, "drop CMD_ACK from %s: status must be ok|error", dev->device_id);
        return;
    }
    int pw = cJSON_IsBool(power) ? (cJSON_IsTrue(power) ? 1 : 0) : GW_ESPNOW_POWER_NONE;
    if (s_cbs.on_cmd_ack) {
        s_cbs.on_cmd_ack(idx, id->valuestring, ok, pw, s_cbs.ctx);
    }
    gw_espnow_send_time_sync(idx);   /* IOT_NODE_NETWORK §7: kèm TIME_SYNC sau mỗi ack */
}

static void handle_heartbeat(size_t idx, const cJSON *body)
{
    const cJSON *uptime = cJSON_GetObjectItemCaseSensitive(body, "uptime");
    const cJSON *fw = cJSON_GetObjectItemCaseSensitive(body, "fw_version");
    uint32_t up = (cJSON_IsNumber(uptime) && uptime->valuedouble >= 0 && uptime->valuedouble < 4294967295.0)
                      ? (uint32_t)uptime->valuedouble
                      : 0;
    char fw_buf[GW_FW_VERSION_MAX + 1] = "";
    if (cJSON_IsString(fw)) {
        /* chuỗi hiển thị lên màn hình — chỉ giữ ký tự in được */
        size_t j = 0;
        for (const char *p = fw->valuestring; *p && j < GW_FW_VERSION_MAX; p++) {
            if (*p >= 0x20 && *p < 0x7f) {
                fw_buf[j++] = *p;
            }
        }
        fw_buf[j] = '\0';
    }
    gw_registry_set_heartbeat(idx, up, fw_buf);
    gw_espnow_send_time_sync(idx);   /* Node/Camera giữ giờ theo Gateway */
}

static void handle_item(const rx_item_t *item)
{
    int idx = gw_registry_find_mac(item->src);
    if (idx < 0) {
        return;
    }
    const gw_device_info_t *dev = gw_registry_get((size_t)idx);
    espnow_frame_view_t f;
    if (!espnow_proto_decode(item->data, item->len, &f)) {
        ESP_LOGW(TAG, "drop malformed frame from %s (%u bytes)", dev->device_id, item->len);
        return;
    }
    if (seq_seen(&s_peers[idx], f.seq)) {
        ESP_LOGD(TAG, "drop duplicate seq %u from %s", f.seq, dev->device_id);
        return;
    }
    cJSON *body = cJSON_ParseWithLength((const char *)f.body, f.body_len);
    if (!cJSON_IsObject(body)) {
        ESP_LOGW(TAG, "drop frame 0x%02x from %s: body is not a JSON object", f.type, dev->device_id);
        cJSON_Delete(body);
        return;
    }
    gw_registry_touch((size_t)idx, item->rssi);

    switch (f.type) {
    case ESPNOW_MSG_PING:
        if (gw_espnow_send_time_sync((size_t)idx) == ESP_ERR_INVALID_STATE) {
            ESP_LOGW(TAG, "PING from %s but gateway has no time yet", dev->device_id);
        }
        break;
    case ESPNOW_MSG_HEARTBEAT:
        handle_heartbeat((size_t)idx, body);
        break;
    case ESPNOW_MSG_TELEMETRY:
        handle_telemetry((size_t)idx, &f, body);
        break;
    case ESPNOW_MSG_EVENT:
        handle_event((size_t)idx, body);
        break;
    case ESPNOW_MSG_CMD_ACK:
        handle_cmd_ack((size_t)idx, body);
        break;
    case ESPNOW_MSG_PAIR_REQUEST:
    case ESPNOW_MSG_PAIR_RESPONSE:
        ESP_LOGW(TAG, "pairing frame 0x%02x from %s not implemented yet", f.type, dev->device_id);
        break;
    default:
        ESP_LOGD(TAG, "ignore frame 0x%02x from %s", f.type, dev->device_id);
        break;
    }
    cJSON_Delete(body);
}

static void espnow_task(void *arg)
{
    rx_item_t item;
    for (;;) {
        if (xQueueReceive(s_rx_queue, &item, portMAX_DELAY) == pdTRUE) {
            handle_item(&item);
        }
    }
}

/* ---- khởi động ---------------------------------------------------------------------------------------- */

static void add_peers(void)
{
    for (size_t i = 0; i < gw_registry_count(); i++) {
        const gw_device_info_t *dev = gw_registry_get(i);
        esp_now_peer_info_t peer = {0};
        memcpy(peer.peer_addr, dev->mac, sizeof(peer.peer_addr));
        peer.channel = 0;              /* theo kênh hiện tại của radio (kênh router / Local AP) */
        peer.ifidx = WIFI_IF_STA;      /* Node/Camera gửi tới MAC Station của Gateway */
        peer.encrypt = gw_registry_copy_lmk(i, peer.lmk);
        if (!peer.encrypt) {
#if defined(CONFIG_GW_ESPNOW_ALLOW_UNENCRYPTED)
            ESP_LOGW(TAG, "DEV: peer %s WITHOUT encryption — disable for demo/production", dev->device_id);
#else
            ESP_LOGE(TAG, "peer %s has no LMK — refusing unencrypted ESP-NOW (nodes/<i>_lmk)", dev->device_id);
            continue;
#endif
        }
        esp_err_t err = esp_now_add_peer(&peer);
        mbedtls_platform_zeroize(&peer, sizeof(peer));   /* xoá bản sao LMK trên stack */
        if (err != ESP_OK) {
            ESP_LOGE(TAG, "add peer %s failed: %s", dev->device_id, esp_err_to_name(err));
            continue;
        }
        s_peers[i].peer_ok = true;
    }
}

esp_err_t gw_espnow_start(const gw_espnow_callbacks_t *cbs)
{
    ESP_RETURN_ON_FALSE(s_rx_queue == NULL, ESP_ERR_INVALID_STATE, TAG, "already started");
    if (cbs) {
        s_cbs = *cbs;
    }
    s_rx_queue = xQueueCreate(RX_QUEUE_LEN, sizeof(rx_item_t));
    s_tx_lock = xSemaphoreCreateMutex();
    s_sent_sem = xSemaphoreCreateBinary();
    ESP_RETURN_ON_FALSE(s_rx_queue && s_tx_lock && s_sent_sem, ESP_ERR_NO_MEM, TAG, "no mem");
    s_tx_seq = (uint16_t)(esp_random() & 0xffff);   /* sau reset không trùng seq cũ → node không bỏ nhầm */

    ESP_RETURN_ON_ERROR(esp_now_init(), TAG, "esp_now_init");
    /* TODO: PMK chung (esp_now_set_pmk) chốt cùng luồng ghép nối; hiện dùng PMK mặc định như Node/Camera. */
    ESP_RETURN_ON_ERROR(esp_now_register_recv_cb(on_recv), TAG, "recv cb");
    ESP_RETURN_ON_ERROR(esp_now_register_send_cb(on_sent), TAG, "send cb");
    add_peers();

    if (xTaskCreatePinnedToCore(espnow_task, "gw_espnow", TASK_STACK, NULL, 5, NULL, 0) != pdPASS) {
        return ESP_ERR_NO_MEM;
    }
    ESP_LOGI(TAG, "ESP-NOW ready on channel %u", gw_wifi_channel());
    return ESP_OK;
}
