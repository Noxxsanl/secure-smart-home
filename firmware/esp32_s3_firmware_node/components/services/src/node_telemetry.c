#include "node_telemetry.h"

#include <inttypes.h>
#include <math.h>
#include <stdarg.h>
#include <stdbool.h>
#include <stdio.h>
#include <string.h>

#include "esp_check.h"
#include "espnow_proto.h"
#include "mbedtls/platform_util.h"
#include "sm_counter.h"
#include "node_link.h"
#include "node_time.h"
#include "security_manager.h"

static const char *TAG = "node_telemetry";

_Static_assert(NODE_TELEMETRY_MAX_LEN == ESPNOW_PROTO_MAX_BODY, "telemetry must fit one ESP-NOW frame");

#define METRIC_KEY_MAX 24

static bool valid_key(const char *s, size_t max, bool allow_upper_dash)
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

/* Nối snprintf có kiểm tràn. */
static bool append(char *out, size_t cap, size_t *used, const char *fmt, ...) __attribute__((format(printf, 4, 5)));

static bool append(char *out, size_t cap, size_t *used, const char *fmt, ...)
{
    if (*used >= cap) {
        return false;
    }
    va_list ap;
    va_start(ap, fmt);
    int n = vsnprintf(out + *used, cap - *used, fmt, ap);
    va_end(ap);
    if (n < 0 || (size_t)n >= cap - *used) {
        return false;
    }
    *used += (size_t)n;
    return true;
}

/* Object số đo {"temperature":28.4,...} không khoảng trắng — đúng các byte được băm và ký. */
static esp_err_t build_data(const node_metric_t *metrics, size_t count, char *out, size_t cap, size_t *len)
{
    size_t used = 0;
    size_t written = 0;
    bool ok = append(out, cap, &used, "{");
    for (size_t i = 0; ok && i < count; i++) {
        const node_metric_t *m = &metrics[i];
        if (!valid_key(m->key, METRIC_KEY_MAX, false)) {
            ESP_LOGW(TAG, "skip metric %u: bad key", (unsigned)i);
            continue;
        }
        if (!isfinite(m->value)) {
            ESP_LOGW(TAG, "skip %s: sensor read failed", m->key);
            continue;
        }
        int dec = m->decimals > 3 ? 3 : m->decimals;
        ok = append(out, cap, &used, "%s\"%s\":%.*f", written ? "," : "", m->key, dec, (double)m->value);
        written++;
    }
    ok = ok && append(out, cap, &used, "}");
    if (!ok) {
        return ESP_ERR_INVALID_SIZE;
    }
    if (written == 0) {
        return ESP_ERR_INVALID_ARG;
    }
    *len = used;
    return ESP_OK;
}

esp_err_t node_telemetry_build(const node_config_t *cfg, const node_metric_t *metrics, size_t count, char *out,
                               size_t cap, size_t *len)
{
    ESP_RETURN_ON_FALSE(cfg && metrics && out && len && cap > 0, ESP_ERR_INVALID_ARG, TAG, "null arg");
    /* device_id lấy từ NVS — chỉ ký tự an toàn (không '|' của chuỗi ký v2, không chèn được JSON). */
    ESP_RETURN_ON_FALSE(valid_key(cfg->device_id, NODE_DEVICE_ID_MAX, true), ESP_ERR_INVALID_ARG, TAG,
                        "device_id has unsafe characters");
    out[0] = '\0';

    int64_t ts;
    if (!node_time_now(&ts)) {
        return ESP_ERR_INVALID_STATE;
    }
    if (cap > NODE_TELEMETRY_MAX_LEN + 1) {
        cap = NODE_TELEMETRY_MAX_LEN + 1;   /* giới hạn khung ESP-NOW */
    }

    char data[NODE_TELEMETRY_MAX_LEN + 1];
    size_t data_len = 0;
    esp_err_t err = build_data(metrics, count, data, sizeof(data), &data_len);
    if (err == ESP_ERR_INVALID_SIZE) {
        ESP_LOGW(TAG, "payload exceeds %d bytes — fewer/shorter fields", NODE_TELEMETRY_MAX_LEN);
    }
    ESP_RETURN_ON_ERROR(err, TAG, "build data");

    int64_t ctr;
    ESP_RETURN_ON_ERROR(sm_counter_next(ts, &ctr), TAG, "counter");

    char sig[SM_HMAC_HEX_LEN + 1];
    ESP_RETURN_ON_ERROR(sm_sensor_sign_v2(cfg->device_secret, cfg->device_id, ts, ctr, data, data_len, sig), TAG,
                        "sign failed");

    /* "data" là khoá CUỐI: Gateway lấy nguyên văn đoạn sau `"data":` tới trước `}` cuối cùng (espnow_proto.h). */
    size_t used = 0;
    bool ok = append(out, cap, &used, "{\"sn_timestamp\":%" PRId64 ",\"sn_ctr\":%" PRId64 ",\"sn_hmac\":\"%s\",\"data\":",
                     ts, ctr, sig) &&
              used + data_len + 1 < cap;
    mbedtls_platform_zeroize(sig, sizeof(sig));
    if (!ok) {
        out[0] = '\0';
        ESP_LOGW(TAG, "payload exceeds %d bytes — fewer/shorter fields", NODE_TELEMETRY_MAX_LEN);
        return ESP_ERR_INVALID_SIZE;
    }
    memcpy(out + used, data, data_len);
    used += data_len;
    out[used++] = '}';
    out[used] = '\0';
    *len = used;
    return ESP_OK;
}

esp_err_t node_telemetry_send(const node_config_t *cfg, const node_metric_t *metrics, size_t count)
{
    char payload[NODE_TELEMETRY_MAX_LEN + 1];
    size_t len = 0;
    ESP_RETURN_ON_ERROR(node_telemetry_build(cfg, metrics, count, payload, sizeof(payload), &len), TAG, "build");
    return node_link_send_telemetry(payload, len);
}
