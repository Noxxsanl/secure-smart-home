#include "gw_api.h"

#include <inttypes.h>
#include <stdbool.h>
#include <stdio.h>
#include <string.h>

#include "cJSON.h"
#include "esp_check.h"
#include "esp_http_client.h"
#include "esp_log.h"
#include "gw_config.h"
#include "gw_time.h"
#include "gw_tls.h"
#include "mbedtls/platform_util.h"

static const char *TAG = "gw_api";

#define URL_MAX (GW_URI_MAX + 48)
#define TELEMETRY_TIMEOUT_MS 5000
#define SNAPSHOT_TIMEOUT_MS 15000

static char s_base[GW_URI_MAX + 1];
static bool s_secure;
static bool s_ready;

esp_err_t gw_api_init(const char *base_url)
{
    s_ready = false;
    if (!gw_tls_uri_allowed(base_url, "https://", "http://", &s_secure)) {
        return ESP_ERR_INVALID_ARG;
    }
    strlcpy(s_base, base_url, sizeof(s_base));
    size_t n = strlen(s_base);
    while (n > 0 && s_base[n - 1] == '/') {
        s_base[--n] = '\0';   /* bỏ '/' cuối để ghép path */
    }
    s_ready = true;
    return ESP_OK;
}

static esp_http_client_handle_t open_client(const char *path, int timeout_ms)
{
    char url[URL_MAX];
    snprintf(url, sizeof(url), "%s%s", s_base, path);
    esp_http_client_config_t cfg = {
        .url = url,
        .method = HTTP_METHOD_POST,
        .timeout_ms = timeout_ms,
        .disable_auto_redirect = true,
        /* https: kiểm chứng bằng CA nhúng + so tên host (bất biến 3). Không có tuỳ chọn bỏ kiểm. */
        .cert_pem = s_secure ? gw_tls_ca_pem() : NULL,
    };
    return esp_http_client_init(&cfg);
}

/* Gửi toàn bộ thân, đọc header + tối đa cap-1 byte phản hồi. Trả mã HTTP, -1 nếu lỗi mạng. */
static int exchange(esp_http_client_handle_t c, const uint8_t *body, size_t len, char *resp, size_t cap)
{
    if (esp_http_client_open(c, (int)len) != ESP_OK) {
        return -1;
    }
    size_t sent = 0;
    while (sent < len) {
        int w = esp_http_client_write(c, (const char *)body + sent, (int)(len - sent));
        if (w <= 0) {
            esp_http_client_close(c);
            return -1;
        }
        sent += (size_t)w;
    }
    if (esp_http_client_fetch_headers(c) < 0) {
        esp_http_client_close(c);
        return -1;
    }
    int status = esp_http_client_get_status_code(c);
    if (resp != NULL && cap > 0) {
        int r = esp_http_client_read_response(c, resp, (int)cap - 1);
        resp[r > 0 ? r : 0] = '\0';
    }
    esp_http_client_close(c);
    return status;
}

esp_err_t gw_api_post_telemetry(const char *json)
{
    ESP_RETURN_ON_FALSE(s_ready, ESP_ERR_INVALID_STATE, TAG, "API not configured");
    ESP_RETURN_ON_FALSE(json, ESP_ERR_INVALID_ARG, TAG, "null body");
    esp_http_client_handle_t c = open_client("/api/device/data", TELEMETRY_TIMEOUT_MS);
    ESP_RETURN_ON_FALSE(c, ESP_ERR_NO_MEM, TAG, "client");
    esp_http_client_set_header(c, "Content-Type", "application/json");
    int status = exchange(c, (const uint8_t *)json, strlen(json), NULL, 0);
    esp_http_client_cleanup(c);
    if (status < 200 || status >= 300) {
        /* 401: sai HMAC gateway/node hoặc lệch giờ — xem audit log trên Dashboard */
        ESP_LOGW(TAG, "POST /api/device/data failed: %s %d", status < 0 ? "network" : "HTTP", status);
        return ESP_FAIL;
    }
    return ESP_OK;
}

/* {snapshot_id: "..."|số} → chuỗi an toàn. */
static void parse_snapshot_id(const char *resp, char out[GW_SNAPSHOT_ID_MAX + 1])
{
    out[0] = '\0';
    cJSON *root = cJSON_Parse(resp);
    const cJSON *id = cJSON_GetObjectItemCaseSensitive(root, "snapshot_id");
    if (cJSON_IsString(id) && gw_valid_id(id->valuestring, GW_SNAPSHOT_ID_MAX)) {
        strlcpy(out, id->valuestring, GW_SNAPSHOT_ID_MAX + 1);
    } else if (cJSON_IsNumber(id) && id->valuedouble >= 0 && id->valuedouble < 9007199254740991.0) {
        snprintf(out, GW_SNAPSHOT_ID_MAX + 1, "%" PRId64, (int64_t)id->valuedouble);
    }
    cJSON_Delete(root);
}

esp_err_t gw_api_post_snapshot(const char *camera_id, const char *trigger, const char *command_id,
                               const uint8_t *jpeg, size_t len, char snapshot_id[GW_SNAPSHOT_ID_MAX + 1])
{
    ESP_RETURN_ON_FALSE(s_ready, ESP_ERR_INVALID_STATE, TAG, "API not configured");
    ESP_RETURN_ON_FALSE(camera_id && trigger && jpeg && len > 0 && snapshot_id, ESP_ERR_INVALID_ARG, TAG, "arg");
    snapshot_id[0] = '\0';
    int64_t ts;
    ESP_RETURN_ON_FALSE(gw_time_now(&ts), ESP_ERR_INVALID_STATE, TAG, "clock not synced");
    char ts_str[24];
    char sig[SM_HMAC_HEX_LEN + 1];
    snprintf(ts_str, sizeof(ts_str), "%" PRId64, ts);
    ESP_RETURN_ON_ERROR(gw_config_sign_ts(ts, sig), TAG, "sign");

    esp_http_client_handle_t c = open_client("/api/device/camera/snapshot", SNAPSHOT_TIMEOUT_MS);
    if (c == NULL) {
        mbedtls_platform_zeroize(sig, sizeof(sig));
        return ESP_ERR_NO_MEM;
    }
    esp_http_client_set_header(c, "Content-Type", "image/jpeg");
    esp_http_client_set_header(c, "X-Gateway-Id", gw_config_gateway_id());
    esp_http_client_set_header(c, "X-Timestamp", ts_str);
    esp_http_client_set_header(c, "X-Signature", sig);
    esp_http_client_set_header(c, "X-Device-Id", camera_id);
    esp_http_client_set_header(c, "X-Trigger", trigger);
    if (command_id != NULL && command_id[0] != '\0') {
        esp_http_client_set_header(c, "X-Command-Id", command_id);
    }
    mbedtls_platform_zeroize(sig, sizeof(sig));

    char resp[160];
    int status = exchange(c, jpeg, len, resp, sizeof(resp));
    esp_http_client_cleanup(c);
    if (status != 201 && status != 200) {
        ESP_LOGW(TAG, "POST /api/device/camera/snapshot failed: %s %d%s", status < 0 ? "network" : "HTTP", status,
                 status == 404 ? " (endpoint not implemented on backend yet)" : "");
        return ESP_FAIL;
    }
    parse_snapshot_id(resp, snapshot_id);
    ESP_LOGI(TAG, "snapshot uploaded (%u bytes) id=%s", (unsigned)len, snapshot_id[0] ? snapshot_id : "?");
    return ESP_OK;
}
