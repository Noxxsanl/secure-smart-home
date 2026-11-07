#include "cam_config.h"

#include <ctype.h>
#include <stdio.h>
#include <string.h>

#include "esp_log.h"
#include "nvs.h"

static const char *TAG = "cam_config";

/* Đọc 1 chuỗi; chỉ log TÊN key, không log giá trị. */
static esp_err_t read_str(nvs_handle_t h, const char *ns, const char *key, char *buf, size_t cap)
{
    size_t len = cap;
    esp_err_t err = nvs_get_str(h, key, buf, &len);
    if (err == ESP_OK && buf[0] == '\0') {
        err = ESP_ERR_NOT_FOUND;
    }
    if (err != ESP_OK) {
        ESP_LOGW(TAG, "missing %s/%s (%s)", ns, key, esp_err_to_name(err));
    }
    return err;
}

static int hex_val(char c)
{
    if (c >= '0' && c <= '9') return c - '0';
    c = (char)tolower((unsigned char)c);
    if (c >= 'a' && c <= 'f') return c - 'a' + 10;
    return -1;
}

static bool parse_hex(const char *s, uint8_t *out, size_t n)
{
    if (strlen(s) != n * 2) {
        return false;
    }
    for (size_t i = 0; i < n; i++) {
        int hi = hex_val(s[2 * i]);
        int lo = hex_val(s[2 * i + 1]);
        if (hi < 0 || lo < 0) {
            return false;
        }
        out[i] = (uint8_t)((hi << 4) | lo);
    }
    return true;
}

static bool parse_mac(const char *s, uint8_t mac[6])
{
    unsigned int b[6];
    char tail;
    if (sscanf(s, "%2x:%2x:%2x:%2x:%2x:%2x%c", &b[0], &b[1], &b[2], &b[3], &b[4], &b[5], &tail) != 6) {
        return false;
    }
    for (int i = 0; i < 6; i++) {
        mac[i] = (uint8_t)b[i];
    }
    return true;
}

static esp_err_t load_ns(const char *ns, nvs_handle_t *h)
{
    esp_err_t err = nvs_open(ns, NVS_READONLY, h);
    if (err != ESP_OK) {
        ESP_LOGW(TAG, "namespace %s not found (%s)", ns, esp_err_to_name(err));
    }
    return err;
}

esp_err_t cam_config_load(cam_config_t *out)
{
    memset(out, 0, sizeof(*out));
    nvs_handle_t h;
    esp_err_t result = ESP_OK;

    /* identity — bắt buộc */
    if (load_ns("identity", &h) == ESP_OK) {
        if (read_str(h, "identity", "device_uuid", out->device_id, sizeof(out->device_id)) != ESP_OK ||
            read_str(h, "identity", "device_secret", out->device_secret, sizeof(out->device_secret)) != ESP_OK) {
            result = ESP_ERR_NOT_FOUND;
        }
        nvs_close(h);
    } else {
        result = ESP_ERR_NOT_FOUND;
    }

    /* wifi = Local AP của Gateway — bắt buộc */
    if (load_ns("wifi", &h) == ESP_OK) {
        if (read_str(h, "wifi", "ssid", out->wifi_ssid, sizeof(out->wifi_ssid)) != ESP_OK ||
            read_str(h, "wifi", "password", out->wifi_password, sizeof(out->wifi_password)) != ESP_OK) {
            result = ESP_ERR_NOT_FOUND;
        }
        nvs_close(h);
    } else {
        result = ESP_ERR_NOT_FOUND;
    }

    /* pairing — tuỳ chọn ở giai đoạn này */
    if (load_ns("pairing", &h) == ESP_OK) {
        char buf[40];
        if (read_str(h, "pairing", "gateway_mac", buf, sizeof(buf)) == ESP_OK) {
            out->has_gateway_mac = parse_mac(buf, out->gateway_mac);
            if (!out->has_gateway_mac) {
                ESP_LOGW(TAG, "pairing/gateway_mac malformed (expect AA:BB:CC:DD:EE:FF)");
            }
        }
        if (read_str(h, "pairing", "session_key", buf, sizeof(buf)) == ESP_OK) {
            out->has_lmk = parse_hex(buf, out->lmk, CAM_LMK_LEN);
            if (!out->has_lmk) {
                ESP_LOGW(TAG, "pairing/session_key malformed (expect 32 hex chars)");
            }
        }
        memset(buf, 0, sizeof(buf));
        nvs_close(h);
    }

    if (result == ESP_OK) {
        ESP_LOGI(TAG, "device_id=%s local_ap=%s gateway_mac=%s lmk=%s", out->device_id, out->wifi_ssid,
                 out->has_gateway_mac ? "set" : "none", out->has_lmk ? "set" : "none");
    }
    return result;
}
