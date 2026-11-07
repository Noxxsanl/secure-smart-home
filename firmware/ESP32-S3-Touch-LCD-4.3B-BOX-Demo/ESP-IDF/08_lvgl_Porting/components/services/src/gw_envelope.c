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

static const char *TAG = "gw_envelope";

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

char *gw_envelope_telemetry(const char *sensor_payload, size_t len)
{
    int64_t ts;
    if (sensor_payload == NULL || !gw_time_now(&ts)) {
        return NULL;
    }
    cJSON *inner = cJSON_ParseWithLength(sensor_payload, len);
    if (!cJSON_IsObject(inner)) {
        cJSON_Delete(inner);
        return NULL;
    }
    char sig[SM_HMAC_HEX_LEN + 1];
    if (gw_config_sign_ts(ts, sig) != ESP_OK) {
        cJSON_Delete(inner);
        return NULL;
    }
    cJSON *root = cJSON_CreateObject();
    if (root == NULL) {
        cJSON_Delete(inner);
        return NULL;
    }
    cJSON_AddStringToObject(root, "gateway_id", gw_config_gateway_id());
    cJSON_AddNumberToObject(root, "gw_timestamp", (double)ts);
    cJSON_AddStringToObject(root, "gw_hmac", sig);
    mbedtls_platform_zeroize(sig, sizeof(sig));
    char ip[16];
    if (gw_wifi_sta_ip(ip, sizeof(ip))) {
        cJSON_AddStringToObject(root, "gateway_ip", ip);
    }
    cJSON_AddItemToObject(root, "sensor_payload", inner);
    return finish(root);
}

char *gw_envelope_ack(const char *command_id, bool ok, int power)
{
    int64_t ts;
    if (command_id == NULL || !gw_time_now(&ts)) {
        return NULL;
    }
    const char *status = ok ? "ok" : "error";
    char msg[GW_ID_MAX + 32];
    snprintf(msg, sizeof(msg), "%s:%s:%" PRId64, command_id, status, ts);

    cJSON *root = cJSON_CreateObject();
    if (root == NULL) {
        return NULL;
    }
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
    char msg[GW_ID_MAX + 24];
    snprintf(msg, sizeof(msg), "%s:%" PRId64, gw_config_gateway_id(), ts);

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
            cJSON_AddStringToObject(n, "fw_version", nodes[i].fw_version);
        }
        cJSON_AddItemToArray(arr, n);
    }
    if (!add_ts_hmac(root, ts, msg)) {
        cJSON_Delete(root);
        return NULL;
    }
    return finish(root);
}

char *gw_envelope_camera_event(const char *device_id, const char *type, int64_t event_ts, const char *snapshot_id)
{
    if (device_id == NULL || type == NULL || event_ts <= 0) {
        return NULL;
    }
    char msg[GW_ID_MAX + 64];
    snprintf(msg, sizeof(msg), "%s:%s:%" PRId64, device_id, type, event_ts);

    cJSON *root = cJSON_CreateObject();
    if (root == NULL) {
        return NULL;
    }
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
