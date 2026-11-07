#include "gw_mqtt.h"

#include <inttypes.h>
#include <math.h>
#include <stdatomic.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

#include "cJSON.h"
#include "esp_check.h"
#include "esp_log.h"
#include "freertos/FreeRTOS.h"
#include "freertos/semphr.h"
#include "gw_config.h"
#include "gw_time.h"
#include "gw_tls.h"
#include "mqtt_client.h"

static const char *TAG = "gw_mqtt";

#define TOPIC_MAX 192
#define PARTS_MAX 9
#define COMMAND_ID_MAX 64
#define ACTION_MAX 32
#define TS_WINDOW_S 300          /* cùng cửa sổ với backend (command-ack.handler.ts) */
#define SEEN_CMDS 16
#define TS_MAX_VALID 4102444800.0

static esp_mqtt_client_handle_t s_client;
static gw_mqtt_callbacks_t s_cbs;
static atomic_bool s_connected;

/* command_id / job_id đã nhận gần đây — chỉ task MQTT truy cập. */
static char s_seen[SEEN_CMDS][COMMAND_ID_MAX + 1];
static size_t s_seen_next;

/* ---- kiểm lệnh ---------------------------------------------------------------------------------------- */

static bool seen_before(const char *id)
{
    for (size_t i = 0; i < SEEN_CMDS; i++) {
        if (strcmp(s_seen[i], id) == 0) {
            return true;
        }
    }
    return false;
}

static void remember(const char *id)
{
    strlcpy(s_seen[s_seen_next], id, sizeof(s_seen[0]));
    s_seen_next = (s_seen_next + 1) % SEEN_CMDS;
}

static bool all_digits(const char *s, size_t max)
{
    size_t n = strnlen(s, max + 1);
    if (n == 0 || n > max) {
        return false;
    }
    for (size_t i = 0; i < n; i++) {
        if (s[i] < '0' || s[i] > '9') {
            return false;
        }
    }
    return true;
}

/* ts phải là số nguyên trong ±300 s so với giờ Gateway. */
static bool ts_fresh(const cJSON *jts, int64_t *out)
{
    if (!cJSON_IsNumber(jts) || jts->valuedouble <= 0 || jts->valuedouble >= TS_MAX_VALID ||
        floor(jts->valuedouble) != jts->valuedouble) {
        return false;
    }
    int64_t ts = (int64_t)jts->valuedouble;
    int64_t now;
    if (!gw_time_now(&now)) {
        ESP_LOGW(TAG, "drop command: gateway clock not synced");
        return false;
    }
    if (llabs(now - ts) > TS_WINDOW_S) {
        ESP_LOGW(TAG, "drop command: ts outside ±%d s", TS_WINDOW_S);
        return false;
    }
    *out = ts;
    return true;
}

/* {command_id, action, ts, hmac} — `subject` là device_id (lệnh thiết bị) hoặc gateway_id (lệnh gateway). */
static bool parse_signed_cmd(const cJSON *body, const char *subject, const char **cmd_id, const char **action,
                             int64_t *ts)
{
    const cJSON *id = cJSON_GetObjectItemCaseSensitive(body, "command_id");
    const cJSON *act = cJSON_GetObjectItemCaseSensitive(body, "action");
    const cJSON *jts = cJSON_GetObjectItemCaseSensitive(body, "ts");
    const cJSON *hmac = cJSON_GetObjectItemCaseSensitive(body, "hmac");
    if (!cJSON_IsString(id) || !gw_valid_id(id->valuestring, COMMAND_ID_MAX) || !cJSON_IsString(act) ||
        !gw_valid_token(act->valuestring, ACTION_MAX) || !cJSON_IsString(hmac)) {
        ESP_LOGW(TAG, "drop command: bad command_id/action/hmac");
        return false;
    }
    if (!ts_fresh(jts, ts)) {
        return false;
    }
    char msg[COMMAND_ID_MAX + GW_ID_MAX + ACTION_MAX + 32];
    snprintf(msg, sizeof(msg), "%s:%s:%s:%" PRId64, id->valuestring, subject, act->valuestring, *ts);
    if (!gw_config_verify(msg, hmac->valuestring)) {
        ESP_LOGW(TAG, "drop command %s: HMAC mismatch", id->valuestring);
        return false;
    }
    if (seen_before(id->valuestring)) {
        ESP_LOGW(TAG, "drop command %s: replayed", id->valuestring);
        return false;
    }
    remember(id->valuestring);
    *cmd_id = id->valuestring;
    *action = act->valuestring;
    return true;
}

/* Phiên bản firmware: [0-9A-Za-z._-], 1..32 ký tự (VD "1.2.0"). */
static bool valid_version(const char *s)
{
    size_t n = strnlen(s, 33);
    if (n == 0 || n > 32) {
        return false;
    }
    for (size_t i = 0; i < n; i++) {
        char c = s[i];
        if (!((c >= '0' && c <= '9') || (c >= 'a' && c <= 'z') || (c >= 'A' && c <= 'Z') || c == '.' || c == '-' ||
              c == '_')) {
            return false;
        }
    }
    return true;
}

static void handle_ota(const char *home, const cJSON *body)
{
    const cJSON *job = cJSON_GetObjectItemCaseSensitive(body, "job_id");
    const cJSON *ver = cJSON_GetObjectItemCaseSensitive(body, "version");
    const cJSON *jts = cJSON_GetObjectItemCaseSensitive(body, "ts");
    const cJSON *hmac = cJSON_GetObjectItemCaseSensitive(body, "hmac");
    char job_id[24];
    int64_t ts;
    /* job_id của backend là số nguyên (ota_jobs.id, command.types.ts) */
    if (!cJSON_IsNumber(job) || job->valuedouble < 0 || job->valuedouble > 9007199254740991.0 ||
        floor(job->valuedouble) != job->valuedouble || !cJSON_IsString(ver) || !valid_version(ver->valuestring) ||
        !cJSON_IsString(hmac)) {
        ESP_LOGW(TAG, "drop OTA command: bad job_id/version/hmac");
        return;
    }
    if (!ts_fresh(jts, &ts)) {
        return;
    }
    snprintf(job_id, sizeof(job_id), "%" PRId64, (int64_t)job->valuedouble);
    char msg[96];
    snprintf(msg, sizeof(msg), "%s:%s:%" PRId64, job_id, ver->valuestring, ts);
    if (!gw_config_verify(msg, hmac->valuestring)) {
        ESP_LOGW(TAG, "drop OTA job %s: HMAC mismatch", job_id);
        return;
    }
    char seen_key[COMMAND_ID_MAX + 1];
    snprintf(seen_key, sizeof(seen_key), "ota-%s", job_id);
    if (seen_before(seen_key)) {
        return;
    }
    remember(seen_key);
    if (s_cbs.on_ota_cmd) {
        s_cbs.on_ota_cmd(home, job_id, ver->valuestring, s_cbs.ctx);
    }
}

/* ---- nhận --------------------------------------------------------------------------------------------- */

/* Tách theo '/', GIỮ cấp rỗng ("a//b" = 3 phần — wildcard + của MQTT khớp cả cấp rỗng). 0 nếu quá PARTS_MAX. */
static size_t split_topic(char *topic, char *parts[PARTS_MAX])
{
    size_t n = 0;
    char *p = topic;
    for (;;) {
        if (n == PARTS_MAX) {
            return 0;
        }
        parts[n++] = p;
        char *slash = strchr(p, '/');
        if (slash == NULL) {
            return n;
        }
        *slash = '\0';
        p = slash + 1;
    }
}

static void handle_message(const esp_mqtt_event_t *e)
{
    /* Lệnh ngắn: không nhận gói bị chia mảnh (total_data_len > data_len). */
    if (e->current_data_offset != 0 || e->data_len != e->total_data_len || e->topic_len <= 0 ||
        e->topic_len >= TOPIC_MAX) {
        ESP_LOGW(TAG, "drop fragmented/oversized message");
        return;
    }
    char topic[TOPIC_MAX];
    memcpy(topic, e->topic, (size_t)e->topic_len);
    topic[e->topic_len] = '\0';
    char *p[PARTS_MAX];
    size_t n = split_topic(topic, p);
    const char *gw = gw_config_gateway_id();

    /* home/<h>/gateway/<gw>/... */
    if (n < 5 || strcmp(p[0], "home") != 0 || !all_digits(p[1], 15) || strcmp(p[2], "gateway") != 0 ||
        strcmp(p[3], gw) != 0) {
        return;
    }
    cJSON *body = cJSON_ParseWithLength(e->data, (size_t)e->data_len);
    if (!cJSON_IsObject(body)) {
        cJSON_Delete(body);
        ESP_LOGW(TAG, "drop command: body is not a JSON object");
        return;
    }
    const char *home = p[1];
    const char *cmd_id = NULL;
    const char *action = NULL;
    int64_t ts = 0;

    if (n == 7 && strcmp(p[4], "device") == 0 && strcmp(p[6], "command") == 0) {
        const char *dev = p[5];
        if (gw_valid_id(dev, 64) && parse_signed_cmd(body, dev, &cmd_id, &action, &ts)) {
            ESP_LOGI(TAG, "device command %s → %s: %s", cmd_id, dev, action);
            if (s_cbs.on_device_cmd) {
                s_cbs.on_device_cmd(home, dev, cmd_id, action, ts, s_cbs.ctx);
            }
        }
    } else if (n == 5 && strcmp(p[4], "command") == 0) {
        if (parse_signed_cmd(body, gw, &cmd_id, &action, &ts)) {
            ESP_LOGI(TAG, "gateway command %s: %s", cmd_id, action);
            if (s_cbs.on_gateway_cmd) {
                s_cbs.on_gateway_cmd(home, cmd_id, action, s_cbs.ctx);
            }
        }
    } else if (n == 6 && strcmp(p[4], "ota") == 0 && strcmp(p[5], "command") == 0) {
        handle_ota(home, body);
    }
    cJSON_Delete(body);
}

static void subscribe_all(void)
{
    const char *gw = gw_config_gateway_id();
    char t[TOPIC_MAX];
    snprintf(t, sizeof(t), "home/+/gateway/%s/device/+/command", gw);
    esp_mqtt_client_subscribe(s_client, t, 1);
    snprintf(t, sizeof(t), "home/+/gateway/%s/command", gw);
    esp_mqtt_client_subscribe(s_client, t, 1);
    snprintf(t, sizeof(t), "home/+/gateway/%s/ota/command", gw);
    esp_mqtt_client_subscribe(s_client, t, 1);
}

static void on_mqtt_event(void *arg, esp_event_base_t base, int32_t id, void *data)
{
    esp_mqtt_event_handle_t e = data;
    switch ((esp_mqtt_event_id_t)id) {
    case MQTT_EVENT_CONNECTED:
        atomic_store(&s_connected, true);
        ESP_LOGI(TAG, "connected to broker");
        subscribe_all();
        if (s_cbs.on_connection) {
            s_cbs.on_connection(true, s_cbs.ctx);
        }
        break;
    case MQTT_EVENT_DISCONNECTED:
        if (atomic_exchange(&s_connected, false)) {
            ESP_LOGW(TAG, "disconnected from broker");
            if (s_cbs.on_connection) {
                s_cbs.on_connection(false, s_cbs.ctx);
            }
        }
        break;
    case MQTT_EVENT_DATA:
        handle_message(e);
        break;
    case MQTT_EVENT_ERROR:
        if (e->error_handle && e->error_handle->error_type == MQTT_ERROR_TYPE_TCP_TRANSPORT) {
            ESP_LOGW(TAG, "transport error: tls 0x%x, sock errno %d", e->error_handle->esp_tls_last_esp_err,
                     e->error_handle->esp_transport_sock_errno);
        } else if (e->error_handle && e->error_handle->error_type == MQTT_ERROR_TYPE_CONNECTION_REFUSED) {
            ESP_LOGW(TAG, "connection refused by broker (code %d)", e->error_handle->connect_return_code);
        }
        break;
    default:
        break;
    }
}

/* ---- gửi ---------------------------------------------------------------------------------------------- */

static esp_err_t publish(const char *topic, const char *json, int qos)
{
    if (s_client == NULL || json == NULL || !atomic_load(&s_connected)) {
        return ESP_ERR_INVALID_STATE;
    }
    /* enqueue: không chặn bên gọi; task MQTT gửi và giữ trong outbox tới khi broker xác nhận (QoS 1). */
    int id = esp_mqtt_client_enqueue(s_client, topic, json, 0, qos, 0, true);
    return id < 0 ? ESP_FAIL : ESP_OK;
}

esp_err_t gw_mqtt_publish_telemetry(const char *json)
{
    char t[TOPIC_MAX];
    snprintf(t, sizeof(t), "gateway/%s/data", gw_config_gateway_id());
    return publish(t, json, 1);
}

esp_err_t gw_mqtt_publish_ack(const char *home_id, const char *device_id, const char *json)
{
    char t[TOPIC_MAX];
    snprintf(t, sizeof(t), "home/%s/gateway/%s/device/%s/command/ack", home_id, gw_config_gateway_id(), device_id);
    return publish(t, json, 1);
}

esp_err_t gw_mqtt_publish_heartbeat(const char *home_id, const char *json)
{
    char t[TOPIC_MAX];
    snprintf(t, sizeof(t), "home/%s/gateway/%s/heartbeat", home_id, gw_config_gateway_id());
    return publish(t, json, 0);
}

esp_err_t gw_mqtt_publish_camera_event(const char *home_id, const char *device_id, const char *json)
{
    char t[TOPIC_MAX];
    snprintf(t, sizeof(t), "home/%s/gateway/%s/device/%s/camera/event", home_id, gw_config_gateway_id(), device_id);
    return publish(t, json, 1);
}

bool gw_mqtt_connected(void)
{
    return atomic_load(&s_connected);
}

esp_err_t gw_mqtt_start(const char *uri, const gw_mqtt_callbacks_t *cbs)
{
    ESP_RETURN_ON_FALSE(s_client == NULL, ESP_ERR_INVALID_STATE, TAG, "already started");
    bool secure = false;
    if (!gw_tls_uri_allowed(uri, "mqtts://", "mqtt://", &secure)) {
        return ESP_ERR_INVALID_ARG;
    }
    if (cbs) {
        s_cbs = *cbs;
    }
    esp_mqtt_client_config_t cfg = {
        .broker.address.uri = uri,
        /* Kiểm chứng chứng chỉ broker bằng CA nhúng + so tên host với SAN (bất biến 3) */
        .broker.verification.certificate = secure ? gw_tls_ca_pem() : NULL,
        .credentials.client_id = gw_config_gateway_id(),
        .session.keepalive = 30,
        .network.reconnect_timeout_ms = 5000,
        .network.timeout_ms = 10000,
        .buffer.size = 2048,
        .buffer.out_size = 2048,
        .task.stack_size = 6144,
    };
    s_client = esp_mqtt_client_init(&cfg);
    ESP_RETURN_ON_FALSE(s_client, ESP_ERR_NO_MEM, TAG, "client init");
    ESP_RETURN_ON_ERROR(esp_mqtt_client_register_event(s_client, ESP_EVENT_ANY_ID, on_mqtt_event, NULL), TAG, "event");
    ESP_RETURN_ON_ERROR(esp_mqtt_client_start(s_client), TAG, "start");
    ESP_LOGI(TAG, "connecting to %s as %s", uri, gw_config_gateway_id());
    return ESP_OK;
}
