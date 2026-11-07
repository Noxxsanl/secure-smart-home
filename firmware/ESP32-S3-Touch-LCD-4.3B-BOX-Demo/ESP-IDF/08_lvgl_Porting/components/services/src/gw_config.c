#include "gw_config.h"

#include <inttypes.h>
#include <stdio.h>
#include <string.h>

#include "bootloader_random.h"
#include "esp_log.h"
#include "esp_mac.h"
#include "esp_random.h"
#include "mbedtls/platform_util.h"
#include "nvs.h"
#include "sdkconfig.h"

static const char *TAG = "gw_config";

#define GW_SECRET_MAX 128
#define AP_PASSWORD_LEN 16

/* Secret gateway chỉ sống ở đây (bất biến 1, 2): không có hàm nào trả giá trị ra ngoài. */
static char s_secret[GW_SECRET_MAX + 1];
static char s_gateway_id[GW_ID_MAX + 1];

static bool valid_chars(const char *s, size_t max, bool allow_upper_dash)
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

bool gw_valid_id(const char *s, size_t max)
{
    return valid_chars(s, max, true);
}

bool gw_valid_token(const char *s, size_t max)
{
    return valid_chars(s, max, false);
}

/* Đọc 1 chuỗi; chỉ log TÊN key, không log giá trị. `quiet`: thiếu key là bình thường (không cảnh báo). */
static esp_err_t read_str(nvs_handle_t h, const char *ns, const char *key, char *buf, size_t cap, bool quiet)
{
    size_t len = cap;
    esp_err_t err = nvs_get_str(h, key, buf, &len);
    if (err == ESP_OK && buf[0] == '\0') {
        err = ESP_ERR_NOT_FOUND;
    }
    if (err != ESP_OK) {
        buf[0] = '\0';
        if (!quiet || err != ESP_ERR_NVS_NOT_FOUND) {
            ESP_LOGW(TAG, "missing/invalid %s/%s (%s)", ns, key, esp_err_to_name(err));
        }
    }
    return err;
}

/* Local AP chưa cấu hình → sinh SSID theo MAC + mật khẩu ngẫu nhiên, lưu NVS để lần sau giữ nguyên
 * (camera sẽ nhận qua ghép nối). Gọi TRƯỚC khi bật WiFi: bootloader_random_enable cần radio đang tắt. */
static esp_err_t generate_local_ap(gw_config_t *cfg)
{
    static const char CHARS[] = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789";
    uint8_t mac[6] = {0};
    esp_read_mac(mac, ESP_MAC_WIFI_STA);
    snprintf(cfg->ap_ssid, sizeof(cfg->ap_ssid), "SH-GW-%02X%02X", mac[4], mac[5]);

    bootloader_random_enable();   /* nguồn entropy thật khi radio chưa bật */
    for (size_t i = 0; i < AP_PASSWORD_LEN; i++) {
        cfg->ap_password[i] = CHARS[esp_random() % (sizeof(CHARS) - 1)];
    }
    bootloader_random_disable();
    cfg->ap_password[AP_PASSWORD_LEN] = '\0';

    nvs_handle_t h;
    esp_err_t err = nvs_open("local_ap", NVS_READWRITE, &h);
    if (err == ESP_OK) {
        err = nvs_set_str(h, "ssid", cfg->ap_ssid);
        if (err == ESP_OK) {
            err = nvs_set_str(h, "password", cfg->ap_password);
        }
        if (err == ESP_OK) {
            err = nvs_commit(h);
        }
        nvs_close(h);
    }
    ESP_LOGW(TAG, "local_ap not configured — generated %s (password stored in NVS, not shown)", cfg->ap_ssid);
    return err;
}

esp_err_t gw_config_load(gw_config_t *out)
{
    if (out == NULL) {
        return ESP_ERR_INVALID_ARG;
    }
    memset(out, 0, sizeof(*out));
    mbedtls_platform_zeroize(s_secret, sizeof(s_secret));
    s_gateway_id[0] = '\0';
    nvs_handle_t h;

    /* identity — bắt buộc */
    esp_err_t result = nvs_open("identity", NVS_READONLY, &h);
    if (result == ESP_OK) {
        if (read_str(h, "identity", "device_uuid", out->device_id, sizeof(out->device_id), false) != ESP_OK ||
            read_str(h, "identity", "device_secret", s_secret, sizeof(s_secret), false) != ESP_OK) {
            result = ESP_ERR_NOT_FOUND;
        }
        nvs_close(h);
    } else {
        ESP_LOGE(TAG, "namespace identity not found — gateway not provisioned (README: nạp NVS)");
        result = ESP_ERR_NOT_FOUND;
    }
    /* gateway_id được ghép vào JSON/topic MQTT — chỉ cho ký tự an toàn. */
    if (result == ESP_OK && !gw_valid_id(out->device_id, GW_ID_MAX)) {
        ESP_LOGE(TAG, "identity/device_uuid has unsafe characters (allowed: A-Z a-z 0-9 _ -)");
        result = ESP_ERR_INVALID_ARG;
    }
    if (result != ESP_OK) {
        mbedtls_platform_zeroize(s_secret, sizeof(s_secret));
        return result;
    }
    strlcpy(s_gateway_id, out->device_id, sizeof(s_gateway_id));

    /* wifi — router của nhà, có thể chưa có (chưa provisioning) */
    if (nvs_open("wifi", NVS_READONLY, &h) == ESP_OK) {
        out->has_wifi = read_str(h, "wifi", "ssid", out->wifi_ssid, sizeof(out->wifi_ssid), false) == ESP_OK;
        if (out->has_wifi) {
            read_str(h, "wifi", "password", out->wifi_password, sizeof(out->wifi_password), true);   /* mạng mở */
        }
        nvs_close(h);
    }

    /* local_ap — cho Camera */
    bool have_ap = false;
    if (nvs_open("local_ap", NVS_READONLY, &h) == ESP_OK) {
        have_ap = read_str(h, "local_ap", "ssid", out->ap_ssid, sizeof(out->ap_ssid), true) == ESP_OK &&
                  read_str(h, "local_ap", "password", out->ap_password, sizeof(out->ap_password), true) == ESP_OK;
        nvs_close(h);
    }
    if (have_ap && strlen(out->ap_password) < 8) {
        ESP_LOGW(TAG, "local_ap/password shorter than 8 chars (WPA2 minimum) — regenerating");
        have_ap = false;
    }
    if (!have_ap && generate_local_ap(out) != ESP_OK) {
        ESP_LOGW(TAG, "could not persist generated local_ap");
    }

    /* cloud — không bí mật; NVS ghi đè menuconfig */
    strlcpy(out->mqtt_uri, CONFIG_GW_MQTT_URI_DEFAULT, sizeof(out->mqtt_uri));
    strlcpy(out->api_url, CONFIG_GW_API_URL_DEFAULT, sizeof(out->api_url));
    if (nvs_open("cloud", NVS_READONLY, &h) == ESP_OK) {
        char buf[GW_URI_MAX + 1];
        if (read_str(h, "cloud", "mqtt_uri", buf, sizeof(buf), true) == ESP_OK) {
            strlcpy(out->mqtt_uri, buf, sizeof(out->mqtt_uri));
        }
        if (read_str(h, "cloud", "api_url", buf, sizeof(buf), true) == ESP_OK) {
            strlcpy(out->api_url, buf, sizeof(out->api_url));
        }
        char home[GW_HOME_ID_MAX + 1];
        if (read_str(h, "cloud", "home_id", home, sizeof(home), true) == ESP_OK) {
            bool digits = true;
            for (const char *p = home; *p; p++) {
                digits = digits && (*p >= '0' && *p <= '9');
            }
            if (digits) {
                strlcpy(out->home_id, home, sizeof(out->home_id));
            } else {
                ESP_LOGW(TAG, "cloud/home_id must be digits — ignored");
            }
        }
        nvs_close(h);
    }

    ESP_LOGI(TAG, "gateway_id=%s wifi=%s local_ap=%s mqtt=%s api=%s home_id=%s", out->device_id,
             out->has_wifi ? out->wifi_ssid : "(none)", out->ap_ssid, out->mqtt_uri, out->api_url,
             out->home_id[0] ? out->home_id : "(learn from command)");
    return ESP_OK;
}

void gw_config_wipe_passwords(gw_config_t *cfg)
{
    if (cfg != NULL) {
        mbedtls_platform_zeroize(cfg->wifi_password, sizeof(cfg->wifi_password));
        mbedtls_platform_zeroize(cfg->ap_password, sizeof(cfg->ap_password));
    }
}

const char *gw_config_gateway_id(void)
{
    return s_gateway_id;
}

esp_err_t gw_config_sign(const char *msg, char out_hex[SM_HMAC_HEX_LEN + 1])
{
    if (s_secret[0] == '\0') {
        return ESP_ERR_INVALID_STATE;
    }
    return sm_hmac_sha256_hex(s_secret, msg, out_hex);
}

esp_err_t gw_config_sign_ts(int64_t ts, char out_hex[SM_HMAC_HEX_LEN + 1])
{
    if (s_secret[0] == '\0') {
        return ESP_ERR_INVALID_STATE;
    }
    return sm_device_sign(s_secret, s_gateway_id, ts, out_hex);
}

bool gw_config_verify(const char *msg, const char *sig_hex)
{
    return s_secret[0] != '\0' && sm_hmac_verify_hex(s_secret, msg, sig_hex);
}
