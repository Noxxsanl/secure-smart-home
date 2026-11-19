#include "gw_envelope.h"

#include <inttypes.h>
#include <stdio.h>
#include <string.h>

#include "cJSON.h"
#include "esp_app_desc.h"
#include "esp_log.h"
#include "gw_config.h"
#include "gw_time.h"
#include "gw_wifi.h"
#include "mbedtls/platform_util.h"
#include "security_manager.h"
#include "sm_counter.h"

static const char *TAG = "gw_envelope";

#define GW_FW_VERSION_LEN 31   /* = GW_FW_VERSION_MAX của gw_registry */

/* cJSON_PrintUnformatted cấp phát bằng cJSON hooks (mặc định malloc) → bên gọi free(). */
static char *finish(cJSON *root)
{
    char *out = root ? cJSON_PrintUnformatted(root) : NULL;
    cJSON_Delete(root);
    if (out == NULL) {
        ESP_LOGW(TAG, "build payload failed (no memory?)");
    }
    return out;
}

/* Thêm {ts, hmac = HMAC(secret gw, msg)}; msg được dựng từ ts bởi bên gọi qua format. */
static bool add_ts_hmac(cJSON *root, int64_t ts, const char *msg)
{
    char sig[SM_HMAC_HEX_LEN + 1];
    if (gw_config_sign(msg, sig) != ESP_OK) {
        return false;
    }
    cJSON_AddNumberToObject(root, "ts", (double)ts);
    cJSON_AddStringToObject(root, "hmac", sig);
    mbedtls_platform_zeroize(sig, sizeof(sig));
    return true;
}

#define DATA_RAW_MAX 256   /* > body ESP-NOW (246 byte) */

char *gw_envelope_telemetry_v2(const char *sensor_id, int64_t sn_ts, int64_t sn_ctr, const char *sn_hmac,
                               const char *data_raw, size_t data_len)
{
    int64_t ts;
    if (sensor_id == NULL || sn_hmac == NULL || data_raw == NULL || data_len == 0 || data_len >= DATA_RAW_MAX ||
        !gw_time_now(&ts)) {
        return NULL;
    }
    char ip[16] = "";
    if (!gw_wifi_sta_ip(ip, sizeof(ip))) {
        ip[0] = '\0';   /* chưa có IP: ký chuỗi rỗng, không gửi trường gateway_ip */
    }
    /* Chuỗi ký v2 — khớp backend/src/modules/devices/domain/signature-v2.ts (gatewayMessageV2) */
    char msg[GW_ID_MAX * 2 + SM_HMAC_HEX_LEN + 96];
    int n = snprintf(msg, sizeof(msg), "v2|gw|%s|%" PRId64 "|%s|%s|%" PRId64 "|%s", gw_config_gateway_id(), ts, ip,
                     sensor_id, sn_ctr, sn_hmac);
    if (n <= 0 || (size_t)n >= sizeof(msg)) {
        return NULL;
    }
    char sig[SM_HMAC_HEX_LEN + 1];
    if (gw_config_sign(msg, sig) != ESP_OK) {
        return NULL;
    }
    /* cJSON cần chuỗi kết thúc NUL; data_raw nằm giữa body ESP-NOW nên chép ra. Ghi dạng CHUỖI → byte giữ nguyên. */
    char data[DATA_RAW_MAX];
    memcpy(data, data_raw, data_len);
    data[data_len] = '\0';

    cJSON *root = cJSON_CreateObject();
    cJSON *sensor = cJSON_CreateObject();
    if (root == NULL || sensor == NULL) {
        cJSON_Delete(root);
        cJSON_Delete(sensor);
        mbedtls_platform_zeroize(sig, sizeof(sig));
        return NULL;
    }
    cJSON_AddNumberToObject(root, "v", 2);
    cJSON_AddStringToObject(root, "gateway_id", gw_config_gateway_id());
    cJSON_AddNumberToObject(root, "gw_timestamp", (double)ts);
    cJSON_AddStringToObject(root, "gw_hmac", sig);
    mbedtls_platform_zeroize(sig, sizeof(sig));
    if (ip[0] != '\0') {
        cJSON_AddStringToObject(root, "gateway_ip", ip);
    }
    cJSON_AddStringToObject(sensor, "sensor_id", sensor_id);
    cJSON_AddNumberToObject(sensor, "sn_timestamp", (double)sn_ts);
    cJSON_AddNumberToObject(sensor, "sn_ctr", (double)sn_ctr);
    cJSON_AddStringToObject(sensor, "sn_hmac", sn_hmac);
    cJSON_AddStringToObject(sensor, "data_raw", data);
    cJSON_AddItemToObject(root, "sensor_payload", sensor);
    return finish(root);
}

/* Trường nối bằng '|' không được chứa '|' (id đã giới hạn [A-Za-z0-9_.:-] ở nơi nhận). */
static bool field_safe(const char *s)
{
    return s != NULL && strchr(s, '|') == NULL;
}

char *gw_envelope_ack(const char *device_uid, const char *command_id, bool ok, int power)
{
    int64_t ts;
    if (device_uid == NULL || device_uid[0] == '\0' || command_id == NULL || command_id[0] == '\0' ||
        !field_safe(device_uid) || !field_safe(command_id) || !gw_time_now(&ts)) {
        return NULL;
    }
    const char *status = ok ? "ok" : "error";
    /* "v2|ack|<gw>|<device_uid>|<command_id>|<status>|<power>|<ts>"; power = "1" | "0" | "" (không có trường power) */
    const char *power_s = power < 0 ? "" : (power != 0 ? "1" : "0");
    char msg[GW_ID_MAX * 3 + 64];
    int n = snprintf(msg, sizeof(msg), "v2|ack|%s|%s|%s|%s|%s|%" PRId64, gw_config_gateway_id(), device_uid, command_id,
                     status, power_s, ts);
    if (n <= 0 || (size_t)n >= sizeof(msg)) {
        return NULL;
    }

    cJSON *root = cJSON_CreateObject();
    if (root == NULL) {
        return NULL;
    }
    cJSON_AddNumberToObject(root, "v", 2);
    cJSON_AddStringToObject(root, "command_id", command_id);
    cJSON_AddStringToObject(root, "status", status);
    if (power >= 0) {
        cJSON_AddBoolToObject(root, "power", power != 0);
    }
    if (!add_ts_hmac(root, ts, msg)) {
        cJSON_Delete(root);
        return NULL;
    }
    return finish(root);
}

char *gw_envelope_heartbeat(uint32_t uptime_s, const gw_envelope_node_t *nodes, size_t count)
{
    int64_t ts;
    if (!gw_time_now(&ts)) {
        return NULL;
    }
    cJSON *root = cJSON_CreateObject();
    if (root == NULL) {
        return NULL;
    }
    cJSON_AddNumberToObject(root, "uptime", uptime_s);
    int rssi;
    if (gw_wifi_rssi(&rssi)) {
        cJSON_AddNumberToObject(root, "rssi", rssi);
    }
    char ip[16];
    if (gw_wifi_sta_ip(ip, sizeof(ip))) {
        cJSON_AddStringToObject(root, "ip", ip);
    }
    cJSON_AddStringToObject(root, "fw_version", esp_app_get_description()->version);
    cJSON *arr = cJSON_AddArrayToObject(root, "nodes");
    for (size_t i = 0; arr && i < count; i++) {
        cJSON *n = cJSON_CreateObject();
        if (n == NULL) {
            break;
        }
        cJSON_AddStringToObject(n, "device_id", nodes[i].device_id);
        cJSON_AddBoolToObject(n, "online", nodes[i].online);
        cJSON_AddNumberToObject(n, "rssi", nodes[i].rssi);
        if (nodes[i].last_seen > 0) {
            cJSON_AddNumberToObject(n, "last_seen", (double)nodes[i].last_seen);
        }
        if (nodes[i].fw_version && nodes[i].fw_version[0]) {
            /* fw_version do node tự khai qua ESP-NOW: body_raw chỉ được chứa ASCII in được */
            char fw[GW_FW_VERSION_LEN + 1];
            size_t k = 0;
            for (; k < GW_FW_VERSION_LEN && nodes[i].fw_version[k] != '\0'; k++) {
                unsigned char c = (unsigned char)nodes[i].fw_version[k];
                fw[k] = (c >= 0x20 && c <= 0x7e) ? (char)c : '?';
            }
            fw[k] = '\0';
            cJSON_AddStringToObject(n, "fw_version", fw);
        }
        cJSON_AddItemToArray(arr, n);
    }
    /* body_raw = đúng các byte JSON này; backend băm các byte đó rồi mới parse (không dựng lại từ object). */
    char *body = finish(root);
    if (body == NULL) {
        return NULL;
    }
    size_t body_len = strlen(body);
    bool ascii = true;
    for (size_t i = 0; i < body_len; i++) {
        if ((unsigned char)body[i] < 0x20 || (unsigned char)body[i] > 0x7e) {
            ascii = false;
            break;
        }
    }
    if (!ascii || body_len > GW_HEARTBEAT_BODY_MAX) {
        ESP_LOGW(TAG, "heartbeat body not sendable (%u bytes, ascii=%d)", (unsigned)body_len, (int)ascii);
        free(body);
        return NULL;
    }

    /* "v2|hb|<gw>|<ts>|<ctr>|<sha256_hex(body_raw)>" — ctr tăng ngặt (sm_counter), backend chiếm trên dòng gateway */
    int64_t ctr;
    char sha[SM_HMAC_HEX_LEN + 1];
    char msg[GW_ID_MAX + SM_HMAC_HEX_LEN + 64];
    char sig[SM_HMAC_HEX_LEN + 1];
    if (sm_counter_next(ts, &ctr) != ESP_OK || sm_sha256_hex(body, body_len, sha) != ESP_OK) {
        free(body);
        return NULL;
    }
    int n = snprintf(msg, sizeof(msg), "v2|hb|%s|%" PRId64 "|%" PRId64 "|%s", gw_config_gateway_id(), ts, ctr, sha);
    if (n <= 0 || (size_t)n >= sizeof(msg) || gw_config_sign(msg, sig) != ESP_OK) {
        free(body);
        return NULL;
    }

    cJSON *out = cJSON_CreateObject();
    if (out == NULL) {
        free(body);
        mbedtls_platform_zeroize(sig, sizeof(sig));
        return NULL;
    }
    cJSON_AddNumberToObject(out, "v", 2);
    cJSON_AddNumberToObject(out, "ts", (double)ts);
    cJSON_AddNumberToObject(out, "ctr", (double)ctr);
    cJSON_AddStringToObject(out, "hmac", sig);
    mbedtls_platform_zeroize(sig, sizeof(sig));
    cJSON_AddStringToObject(out, "body_raw", body);   /* ghi dạng CHUỖI → byte giữ nguyên sau khi parse */
    free(body);
    return finish(out);
}

char *gw_envelope_camera_event(const char *device_id, const char *type, int64_t event_ts, const char *snapshot_id)
{
    if (device_id == NULL || type == NULL || event_ts <= 0 || !field_safe(device_id) || !field_safe(type) ||
        (snapshot_id != NULL && !field_safe(snapshot_id))) {
        return NULL;
    }
    /* "v2|evt|<gw>|<cam_id>|<type>|<ts>|<snapshot_id hoặc rỗng>" */
    char msg[GW_ID_MAX * 3 + 64];
    int n = snprintf(msg, sizeof(msg), "v2|evt|%s|%s|%s|%" PRId64 "|%s", gw_config_gateway_id(), device_id, type,
                     event_ts, snapshot_id != NULL ? snapshot_id : "");
    if (n <= 0 || (size_t)n >= sizeof(msg)) {
        return NULL;
    }

    cJSON *root = cJSON_CreateObject();
    if (root == NULL) {
        return NULL;
    }
    cJSON_AddNumberToObject(root, "v", 2);
    cJSON_AddStringToObject(root, "type", type);
    if (snapshot_id != NULL && snapshot_id[0] != '\0') {
        cJSON_AddStringToObject(root, "snapshot_id", snapshot_id);
    }
    /* ts của sự kiện (giờ camera, đã đồng bộ theo Gateway) — cũng là ts được ký. */
    if (!add_ts_hmac(root, event_ts, msg)) {
        cJSON_Delete(root);
        return NULL;
    }
    return finish(root);
}
