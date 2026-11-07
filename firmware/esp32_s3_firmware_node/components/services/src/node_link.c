#include "node_link.h"

#include <stdatomic.h>
#include <stdlib.h>
#include <string.h>

#include "esp_app_desc.h"
#include "esp_check.h"
#include "esp_event.h"
#include "esp_log.h"
#include "esp_mac.h"
#include "esp_netif.h"
#include "esp_now.h"
#include "esp_random.h"
#include "esp_timer.h"
#include "esp_wifi.h"
#include "espnow_proto.h"
#include "freertos/FreeRTOS.h"
#include "freertos/queue.h"
#include "freertos/semphr.h"
#include "freertos/task.h"
#include "mbedtls/platform_util.h"
#include "node_time.h"
#include "sdkconfig.h"

static const char *TAG = "node_link";

#define RX_QUEUE_LEN 8
#define SEND_ACK_TIMEOUT_MS 100
#define CHANNEL_SETTLE_MS 5
#define SCAN_RETRY_MIN_MS 2000
#define SCAN_RETRY_MAX_MS 30000
#define RX_POLL_MS 200
#define PINGS_BEFORE_WARN 3
#define PING_INTERVAL_US ((int64_t)CONFIG_NODE_PING_INTERVAL_S * 1000 * 1000)
#define HEARTBEAT_INTERVAL_US ((int64_t)CONFIG_NODE_HEARTBEAT_INTERVAL_S * 1000 * 1000)
#define LINK_TASK_STACK 6144   /* callback lệnh của tầng trên chạy trên stack này */

#define COMMAND_ID_MAX 64
#define ACTION_MAX 32
#define EVENT_MAX 32
#define CMD_CACHE_LEN 8
#define SEQ_HISTORY 8
#define TS_MAX_VALID 4102444800.0   /* 2100-01-01 */

typedef struct {
    uint8_t len;
    int8_t rssi;
    uint8_t data[ESPNOW_PROTO_MAX_LEN];
} rx_item_t;

typedef struct {
    char id[COMMAND_ID_MAX + 1];
    bool done;
    bool ok;
    node_power_t power;
} cmd_entry_t;

static uint8_t s_gw_mac[6];
static QueueHandle_t s_rx_queue;
static SemaphoreHandle_t s_tx_lock;
static SemaphoreHandle_t s_sent_sem;
static SemaphoreHandle_t s_cmd_lock;
static volatile bool s_last_send_ok;
static uint16_t s_tx_seq;
static node_link_callbacks_t s_cbs;
static atomic_bool s_online;
static atomic_bool s_started;
static atomic_int s_fail_streak;
static atomic_int s_rssi;
static volatile uint8_t s_channel;

/* Chỉ task node_link truy cập. */
static uint16_t s_seq_hist[SEQ_HISTORY];
static size_t s_seq_count;
static size_t s_seq_next;

/* Truy cập dưới s_cmd_lock. */
static cmd_entry_t s_cmds[CMD_CACHE_LEN];
static size_t s_cmd_next;

/* ---- kiểm định dạng ----------------------------------------------------------------------------------- */

static bool valid_token(const char *s, size_t max, bool allow_upper_dash)
{
    if (s == NULL) {
        return false;
    }
    size_t n = strnlen(s, max + 1);
    if (n == 0 || n > max) {
        return false;
    }
    for (size_t i = 0; i < n; i++) {
        char c = s[i];
        bool ok = (c >= '0' && c <= '9') || (c >= 'a' && c <= 'z') || c == '_';
        if (allow_upper_dash) {
            ok = ok || (c >= 'A' && c <= 'Z') || c == '-';
        }
        if (!ok) {
            return false;
        }
    }
    return true;
}

/* ---- gửi ---------------------------------------------------------------------------------------------- */

/* Gửi 1 khung và chờ ack tầng MAC của Gateway. Mọi lần gửi đi qua đây (ESP-NOW không nên gửi chồng). */
static esp_err_t send_frame(uint8_t type, const char *body, size_t len)
{
    uint8_t frame[ESPNOW_PROTO_MAX_LEN];
    esp_err_t err;

    xSemaphoreTake(s_tx_lock, portMAX_DELAY);
    size_t n = espnow_proto_encode(frame, sizeof(frame), type, s_tx_seq++, body, len);
    if (n == 0) {
        err = ESP_ERR_INVALID_SIZE;
    } else {
        xSemaphoreTake(s_sent_sem, 0);   /* bỏ tín hiệu cũ của lần gửi đã hết giờ */
        err = esp_now_send(s_gw_mac, frame, n);
        if (err == ESP_OK &&
            (xSemaphoreTake(s_sent_sem, pdMS_TO_TICKS(SEND_ACK_TIMEOUT_MS)) != pdTRUE || !s_last_send_ok)) {
            err = ESP_FAIL;
        }
    }
    xSemaphoreGive(s_tx_lock);

    if (n > 0) {
        if (err == ESP_OK) {
            atomic_store(&s_fail_streak, 0);
        } else {
            atomic_fetch_add(&s_fail_streak, 1);
            ESP_LOGD(TAG, "send type 0x%02x: no ack (%s)", type, esp_err_to_name(err));
        }
    } else {
        ESP_LOGW(TAG, "body too long for type 0x%02x (%u bytes)", type, (unsigned)len);
    }
    return err;
}

static esp_err_t send_json(uint8_t type, const cJSON *body)
{
    char json[ESPNOW_PROTO_MAX_BODY + 1];
    if (!cJSON_PrintPreallocated((cJSON *)body, json, sizeof(json), false)) {
        ESP_LOGW(TAG, "body too long for type 0x%02x", type);
        return ESP_ERR_INVALID_SIZE;
    }
    return send_frame(type, json, strlen(json));
}

static void send_ping(void)
{
    send_frame(ESPNOW_MSG_PING, "{}", 2);
}

static void send_heartbeat(void)
{
    cJSON *o = cJSON_CreateObject();
    if (o == NULL) {
        return;
    }
    cJSON_AddNumberToObject(o, "uptime", (double)(esp_timer_get_time() / 1000000));
    cJSON_AddNumberToObject(o, "rssi", atomic_load(&s_rssi));
    cJSON_AddStringToObject(o, "fw_version", esp_app_get_description()->version);
    send_json(ESPNOW_MSG_HEARTBEAT, o);
    cJSON_Delete(o);
}

static esp_err_t send_ack_body(const char *command_id, bool ok, node_power_t power)
{
    cJSON *o = cJSON_CreateObject();
    if (o == NULL) {
        return ESP_ERR_NO_MEM;
    }
    cJSON_AddStringToObject(o, "command_id", command_id);
    cJSON_AddStringToObject(o, "status", ok ? "ok" : "error");
    if (power != NODE_POWER_UNKNOWN) {
        cJSON_AddBoolToObject(o, "power", power == NODE_POWER_ON);
    }
    esp_err_t err = send_json(ESPNOW_MSG_CMD_ACK, o);
    cJSON_Delete(o);
    return err;
}

esp_err_t node_link_send_telemetry(const char *payload, size_t len)
{
    ESP_RETURN_ON_FALSE(payload && len > 0, ESP_ERR_INVALID_ARG, TAG, "empty payload");
    if (!atomic_load(&s_online)) {
        return ESP_ERR_INVALID_STATE;
    }
    return send_frame(ESPNOW_MSG_TELEMETRY, payload, len);
}

esp_err_t node_link_send_event(const char *event, int64_t ts)
{
    ESP_RETURN_ON_FALSE(valid_token(event, EVENT_MAX, false), ESP_ERR_INVALID_ARG, TAG, "bad event name");
    if (!atomic_load(&s_online)) {
        return ESP_ERR_INVALID_STATE;
    }
    cJSON *o = cJSON_CreateObject();
    ESP_RETURN_ON_FALSE(o, ESP_ERR_NO_MEM, TAG, "no mem");
    cJSON_AddStringToObject(o, "event", event);
    cJSON_AddNumberToObject(o, "ts", (double)ts);
    esp_err_t err = send_json(ESPNOW_MSG_EVENT, o);
    cJSON_Delete(o);
    return err;
}

esp_err_t node_link_send_cmd_ack(const char *command_id, bool ok, node_power_t power)
{
    ESP_RETURN_ON_FALSE(valid_token(command_id, COMMAND_ID_MAX, true), ESP_ERR_INVALID_ARG, TAG, "bad command_id");
    ESP_RETURN_ON_FALSE(atomic_load(&s_started), ESP_ERR_INVALID_STATE, TAG, "link not started");

    /* Ghi kết quả vào bộ nhớ đệm để lần Gateway gửi lại cùng command_id chỉ nhận lại ack này. */
    xSemaphoreTake(s_cmd_lock, portMAX_DELAY);
    cmd_entry_t *e = NULL;
    for (size_t i = 0; i < CMD_CACHE_LEN; i++) {
        if (strcmp(s_cmds[i].id, command_id) == 0) {
            e = &s_cmds[i];
            break;
        }
    }
    if (e == NULL) {
        e = &s_cmds[s_cmd_next];
        s_cmd_next = (s_cmd_next + 1) % CMD_CACHE_LEN;
        strlcpy(e->id, command_id, sizeof(e->id));
    }
    e->done = true;
    e->ok = ok;
    e->power = power;
    xSemaphoreGive(s_cmd_lock);

    ESP_LOGI(TAG, "CMD_ACK %s %s", command_id, ok ? "ok" : "error");
    if (!atomic_load(&s_online)) {
        return ESP_ERR_INVALID_STATE;
    }
    return send_ack_body(command_id, ok, power);
}

/* ---- nhận --------------------------------------------------------------------------------------------- */

/* Chạy trong task WiFi: chỉ lọc nguồn và chép vào hàng đợi, không xử lý gì nặng. */
static void on_recv(const esp_now_recv_info_t *info, const uint8_t *data, int len)
{
    if (info == NULL || data == NULL || len <= 0 || len > ESPNOW_PROTO_MAX_LEN) {
        return;
    }
    if (memcmp(info->src_addr, s_gw_mac, sizeof(s_gw_mac)) != 0) {
        return;   /* TODO: PAIR_* broadcast từ Gateway khi ở chế độ ghép nối (WiFi Provisioning §9.1) */
    }
    rx_item_t item = {
        .len = (uint8_t)len,
        .rssi = info->rx_ctrl ? (int8_t)info->rx_ctrl->rssi : 0,
    };
    memcpy(item.data, data, (size_t)len);
    xQueueSend(s_rx_queue, &item, 0);   /* đầy thì bỏ gói, không chặn task WiFi */
}

static void on_sent(const uint8_t *mac, esp_now_send_status_t status)
{
    s_last_send_ok = (status == ESP_NOW_SEND_SUCCESS);
    xSemaphoreGive(s_sent_sem);
}

/* true nếu seq vừa thấy gần đây (gói phát lại / gửi lặp). */
static bool seq_seen(uint16_t seq)
{
    for (size_t i = 0; i < s_seq_count; i++) {
        if (s_seq_hist[i] == seq) {
            return true;
        }
    }
    s_seq_hist[s_seq_next] = seq;
    s_seq_next = (s_seq_next + 1) % SEQ_HISTORY;
    if (s_seq_count < SEQ_HISTORY) {
        s_seq_count++;
    }
    return false;
}

static void handle_time_sync(const cJSON *body)
{
    const cJSON *ts = cJSON_GetObjectItemCaseSensitive(body, "ts");
    /* Chặn giá trị ngoài khoảng trước khi ép double → int64 (tránh hành vi không xác định). */
    if (cJSON_IsNumber(ts) && ts->valuedouble > 0 && ts->valuedouble < TS_MAX_VALID) {
        node_time_set_unix((int64_t)ts->valuedouble, "gateway");
    } else {
        ESP_LOGW(TAG, "drop TIME_SYNC: bad ts");
    }
}

static bool cmd_ts_acceptable(const cJSON *ts)
{
    if (ts == NULL) {
#if defined(CONFIG_NODE_CMD_REQUIRE_TS)
        ESP_LOGW(TAG, "reject CMD without ts");
        return false;
#else
        return true;
#endif
    }
    if (!cJSON_IsNumber(ts) || ts->valuedouble <= 0 || ts->valuedouble >= TS_MAX_VALID) {
        ESP_LOGW(TAG, "reject CMD: bad ts");
        return false;
    }
    int64_t now;
    if (!node_time_now(&now)) {
        ESP_LOGW(TAG, "reject CMD: clock not synced, cannot check ts");
        return false;
    }
    int64_t skew = now - (int64_t)ts->valuedouble;
    if (llabs(skew) > CONFIG_NODE_CMD_TS_WINDOW_S) {
        ESP_LOGW(TAG, "reject CMD: ts outside ±%d s", CONFIG_NODE_CMD_TS_WINDOW_S);
        return false;
    }
    return true;
}

static void handle_cmd(const cJSON *body)
{
    const cJSON *id = cJSON_GetObjectItemCaseSensitive(body, "command_id");
    const cJSON *action = cJSON_GetObjectItemCaseSensitive(body, "action");
    const cJSON *params = cJSON_GetObjectItemCaseSensitive(body, "params");
    const cJSON *ts = cJSON_GetObjectItemCaseSensitive(body, "ts");

    if (!cJSON_IsString(id) || !valid_token(id->valuestring, COMMAND_ID_MAX, true)) {
        ESP_LOGW(TAG, "drop CMD: bad command_id");   /* không ack được khi không có id hợp lệ */
        return;
    }
    const char *cid = id->valuestring;

    /* Lệnh trùng: không thực thi lại. Đã xong → gửi lại ack cũ; đang làm → im lặng. */
    xSemaphoreTake(s_cmd_lock, portMAX_DELAY);
    cmd_entry_t copy = {0};
    bool seen = false;
    for (size_t i = 0; i < CMD_CACHE_LEN; i++) {
        if (strcmp(s_cmds[i].id, cid) == 0) {
            copy = s_cmds[i];
            seen = true;
            break;
        }
    }
    if (!seen) {
        cmd_entry_t *e = &s_cmds[s_cmd_next];
        s_cmd_next = (s_cmd_next + 1) % CMD_CACHE_LEN;
        memset(e, 0, sizeof(*e));
        strlcpy(e->id, cid, sizeof(e->id));
    }
    xSemaphoreGive(s_cmd_lock);
    if (seen) {
        ESP_LOGW(TAG, "duplicate CMD %s — %s", cid, copy.done ? "re-sending previous ack" : "still running");
        if (copy.done) {
            send_ack_body(cid, copy.ok, copy.power);
        }
        return;
    }

    if (!cJSON_IsString(action) || !valid_token(action->valuestring, ACTION_MAX, false)) {
        ESP_LOGW(TAG, "reject CMD %s: bad action", cid);
        node_link_send_cmd_ack(cid, false, NODE_POWER_UNKNOWN);
        return;
    }
    if (!cmd_ts_acceptable(ts)) {
        node_link_send_cmd_ack(cid, false, NODE_POWER_UNKNOWN);
        return;
    }
    if (s_cbs.on_cmd == NULL) {
        ESP_LOGW(TAG, "no command handler — CMD %s rejected", cid);
        node_link_send_cmd_ack(cid, false, NODE_POWER_UNKNOWN);
        return;
    }

    ESP_LOGI(TAG, "CMD %s action=%s", cid, action->valuestring);
    s_cbs.on_cmd(cid, action->valuestring, cJSON_IsObject(params) ? params : NULL, s_cbs.ctx);
}

static void handle_frame(const rx_item_t *item)
{
    espnow_frame_view_t f;
    if (!espnow_proto_decode(item->data, item->len, &f)) {
        ESP_LOGW(TAG, "drop malformed frame (%u bytes)", item->len);
        return;
    }
    atomic_store(&s_rssi, item->rssi);
    if (seq_seen(f.seq)) {
        ESP_LOGD(TAG, "drop duplicate seq %u", f.seq);
        return;
    }
    if (f.body_len == 0) {
        return;
    }

    cJSON *body = cJSON_ParseWithLength((const char *)f.body, f.body_len);
    if (!cJSON_IsObject(body)) {
        ESP_LOGW(TAG, "drop frame type 0x%02x: body is not a JSON object", f.type);
        cJSON_Delete(body);
        return;
    }

    switch (f.type) {
    case ESPNOW_MSG_TIME_SYNC:
        handle_time_sync(body);
        break;
    case ESPNOW_MSG_CMD:
        handle_cmd(body);
        break;
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

/* ---- dò kênh + vòng chính ----------------------------------------------------------------------------- */

static bool try_channel(uint8_t ch)
{
    if (esp_wifi_set_channel(ch, WIFI_SECOND_CHAN_NONE) != ESP_OK) {
        return false;
    }
    vTaskDelay(pdMS_TO_TICKS(CHANNEL_SETTLE_MS));
    return send_frame(ESPNOW_MSG_PING, "{}", 2) == ESP_OK;
}

static bool scan_channels(void)
{
    uint8_t order[13];
    size_t n = 0;
    uint8_t cached = s_channel;
    if (cached >= 1 && cached <= 13) {
        order[n++] = cached;
    }
    for (uint8_t ch = 1; ch <= 13; ch++) {
        if (ch != cached) {
            order[n++] = ch;
        }
    }
    for (size_t i = 0; i < n; i++) {
        if (try_channel(order[i])) {
            s_channel = order[i];
            return true;
        }
    }
    return false;
}

static void notify_state(bool online)
{
    if (s_cbs.on_state) {
        s_cbs.on_state(online, s_channel, s_cbs.ctx);
    }
}

static void link_task(void *arg)
{
    uint32_t retry_ms = SCAN_RETRY_MIN_MS;
    int64_t last_ping = 0;
    int64_t last_hb = 0;
    unsigned unanswered_pings = 0;
    rx_item_t item;

    for (;;) {
        if (!atomic_load(&s_online)) {
            if (!scan_channels()) {
                ESP_LOGW(TAG, "gateway not found on channels 1-13, retry in %u ms", (unsigned)retry_ms);
                xQueueReset(s_rx_queue);
                vTaskDelay(pdMS_TO_TICKS(retry_ms));
                retry_ms = (retry_ms * 2 > SCAN_RETRY_MAX_MS) ? SCAN_RETRY_MAX_MS : retry_ms * 2;
                continue;
            }
            retry_ms = SCAN_RETRY_MIN_MS;
            atomic_store(&s_fail_streak, 0);
            atomic_store(&s_online, true);
            if (node_config_save_channel(s_channel) != ESP_OK) {
                ESP_LOGW(TAG, "could not persist channel %u", s_channel);
            }
            ESP_LOGI(TAG, "gateway " MACSTR " found on channel %u", MAC2STR(s_gw_mac), s_channel);
            last_ping = esp_timer_get_time();   /* PING lúc dò vừa xin giờ rồi */
            last_hb = 0;
            unanswered_pings = 0;
            notify_state(true);
        }

        if (xQueueReceive(s_rx_queue, &item, pdMS_TO_TICKS(RX_POLL_MS)) == pdTRUE) {
            handle_frame(&item);
        }

        int64_t now = esp_timer_get_time();
        if (node_time_is_synced()) {
            unanswered_pings = 0;
        } else if (now - last_ping >= PING_INTERVAL_US) {
            last_ping = now;
            send_ping();
            if (++unanswered_pings == PINGS_BEFORE_WARN) {
                ESP_LOGW(TAG, "gateway acks at MAC level but sends no TIME_SYNC — check LMK / gateway firmware");
            }
        }
        if (last_hb == 0 || now - last_hb >= HEARTBEAT_INTERVAL_US) {
            last_hb = now;
            send_heartbeat();
        }

        if (atomic_load(&s_fail_streak) >= CONFIG_NODE_LINK_MAX_FAILS) {
            ESP_LOGW(TAG, "lost gateway after %d failed sends — rescanning", CONFIG_NODE_LINK_MAX_FAILS);
            atomic_store(&s_online, false);
            notify_state(false);
        }
    }
}

/* ---- khởi động ---------------------------------------------------------------------------------------- */

static esp_err_t wifi_radio_init(void)
{
    esp_err_t err = esp_netif_init();
    if (err != ESP_OK && err != ESP_ERR_INVALID_STATE) {
        return err;
    }
    err = esp_event_loop_create_default();
    if (err != ESP_OK && err != ESP_ERR_INVALID_STATE) {
        return err;
    }
    wifi_init_config_t cfg = WIFI_INIT_CONFIG_DEFAULT();
    ESP_RETURN_ON_ERROR(esp_wifi_init(&cfg), TAG, "esp_wifi_init failed");
    ESP_RETURN_ON_ERROR(esp_wifi_set_storage(WIFI_STORAGE_RAM), TAG, "set storage failed");
    ESP_RETURN_ON_ERROR(esp_wifi_set_mode(WIFI_MODE_STA), TAG, "set mode failed");
    ESP_RETURN_ON_ERROR(esp_wifi_start(), TAG, "esp_wifi_start failed");
    /* Không kết nối AP nào; tắt tiết kiệm năng lượng để không lỡ khung ESP-NOW. */
    esp_wifi_set_ps(WIFI_PS_NONE);
    return ESP_OK;
}

esp_err_t node_link_start(const node_config_t *cfg, const node_link_callbacks_t *cbs)
{
    ESP_RETURN_ON_FALSE(cfg, ESP_ERR_INVALID_ARG, TAG, "null cfg");
    ESP_RETURN_ON_FALSE(!atomic_load(&s_started), ESP_ERR_INVALID_STATE, TAG, "already started");
    if (!cfg->has_gateway_mac) {
        ESP_LOGW(TAG, "no pairing/gateway_mac — ESP-NOW disabled");
        return ESP_ERR_INVALID_STATE;
    }
    if (!cfg->has_lmk) {
#if defined(CONFIG_NODE_ESPNOW_ALLOW_UNENCRYPTED)
        ESP_LOGW(TAG, "DEV: ESP-NOW peer WITHOUT encryption — disable for demo/production");
#else
        ESP_LOGE(TAG, "no pairing/session_key — refusing unencrypted ESP-NOW");
        return ESP_ERR_INVALID_STATE;
#endif
    }

    s_rx_queue = xQueueCreate(RX_QUEUE_LEN, sizeof(rx_item_t));
    s_tx_lock = xSemaphoreCreateMutex();
    s_cmd_lock = xSemaphoreCreateMutex();
    s_sent_sem = xSemaphoreCreateBinary();
    ESP_RETURN_ON_FALSE(s_rx_queue && s_tx_lock && s_cmd_lock && s_sent_sem, ESP_ERR_NO_MEM, TAG, "no mem");

    memcpy(s_gw_mac, cfg->gateway_mac, sizeof(s_gw_mac));
    s_channel = cfg->channel;
    if (cbs) {
        s_cbs = *cbs;
    }
    s_tx_seq = (uint16_t)(esp_random() & 0xffff);   /* sau reset không trùng seq cũ → Gateway không bỏ nhầm */

    ESP_RETURN_ON_ERROR(wifi_radio_init(), TAG, "wifi radio");
    ESP_RETURN_ON_ERROR(esp_now_init(), TAG, "esp_now_init failed");
    /* TODO: PMK chung (esp_now_set_pmk) chốt cùng luồng ghép nối; hiện dùng PMK mặc định của ESP-IDF. */
    ESP_RETURN_ON_ERROR(esp_now_register_recv_cb(on_recv), TAG, "register recv cb");
    ESP_RETURN_ON_ERROR(esp_now_register_send_cb(on_sent), TAG, "register send cb");

    esp_now_peer_info_t peer = {0};
    memcpy(peer.peer_addr, cfg->gateway_mac, sizeof(peer.peer_addr));
    peer.channel = 0;   /* theo kênh hiện tại của radio — node_link đổi kênh khi dò */
    peer.ifidx = WIFI_IF_STA;
    peer.encrypt = cfg->has_lmk;
    if (cfg->has_lmk) {
        memcpy(peer.lmk, cfg->lmk, sizeof(peer.lmk));
    }
    esp_err_t err = esp_now_add_peer(&peer);
    mbedtls_platform_zeroize(&peer, sizeof(peer));   /* xoá bản sao LMK trên stack */
    ESP_RETURN_ON_ERROR(err, TAG, "add gateway peer failed");

    atomic_store(&s_started, true);
    if (xTaskCreate(link_task, "node_link", LINK_TASK_STACK, NULL, 5, NULL) != pdPASS) {
        atomic_store(&s_started, false);
        return ESP_ERR_NO_MEM;
    }
    ESP_LOGI(TAG, "ESP-NOW started, gateway " MACSTR "%s", MAC2STR(s_gw_mac), cfg->has_lmk ? " (encrypted)" : "");
    return ESP_OK;
}

bool node_link_is_online(void)
{
    return atomic_load(&s_online);
}

uint8_t node_link_channel(void)
{
    return s_channel;
}
