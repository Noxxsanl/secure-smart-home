#include "node_config.h"

#include <ctype.h>
#include <stdio.h>
#include <string.h>

#include "esp_log.h"
#include "mbedtls/platform_util.h"
#include "nvs.h"

static const char *TAG = "node_config";

#define NS_IDENTITY "identity"
#define NS_PAIRING "pairing"
#define KEY_CHANNEL "channel"

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
    /* MAC broadcast/multicast không thể là peer unicast mã hoá. */
    return (mac[0] & 0x01) == 0;
}

static bool all_zero(const uint8_t *p, size_t n)
{
    uint8_t acc = 0;
    for (size_t i = 0; i < n; i++) {
        acc |= p[i];
    }
    return acc == 0;
}

esp_err_t node_config_load(node_config_t *out)
{
    if (out == NULL) {
        return ESP_ERR_INVALID_ARG;
    }
    memset(out, 0, sizeof(*out));
    nvs_handle_t h;
    esp_err_t result = ESP_OK;

    /* identity — bắt buộc */
    if (nvs_open(NS_IDENTITY, NVS_READONLY, &h) == ESP_OK) {
        if (read_str(h, NS_IDENTITY, "device_uuid", out->device_id, sizeof(out->device_id)) != ESP_OK ||
            read_str(h, NS_IDENTITY, "device_secret", out->device_secret, sizeof(out->device_secret)) != ESP_OK) {
            result = ESP_ERR_NOT_FOUND;
        }
        nvs_close(h);
    } else {
        ESP_LOGW(TAG, "namespace %s not found — node not provisioned", NS_IDENTITY);
        result = ESP_ERR_NOT_FOUND;
    }

    /* pairing — có thể chưa có */
    if (nvs_open(NS_PAIRING, NVS_READONLY, &h) == ESP_OK) {
        char buf[40];
        if (read_str(h, NS_PAIRING, "gateway_mac", buf, sizeof(buf)) == ESP_OK) {
            out->has_gateway_mac = parse_mac(buf, out->gateway_mac);
            if (!out->has_gateway_mac) {
                ESP_LOGW(TAG, "pairing/gateway_mac malformed (expect unicast AA:BB:CC:DD:EE:FF)");
            }
        }
        if (read_str(h, NS_PAIRING, "session_key", buf, sizeof(buf)) == ESP_OK) {
            out->has_lmk = parse_hex(buf, out->lmk, NODE_LMK_LEN) && !all_zero(out->lmk, NODE_LMK_LEN);
            if (!out->has_lmk) {
                ESP_LOGW(TAG, "pairing/session_key malformed or all-zero (expect 32 hex chars)");
                mbedtls_platform_zeroize(out->lmk, sizeof(out->lmk));
            }
        }
        mbedtls_platform_zeroize(buf, sizeof(buf));
        uint8_t ch = 0;
        if (nvs_get_u8(h, KEY_CHANNEL, &ch) == ESP_OK && ch >= 1 && ch <= 13) {
            out->channel = ch;
        }
        nvs_close(h);
    }

    if (result == ESP_OK) {
        ESP_LOGI(TAG, "device_id=%s gateway_mac=%s lmk=%s channel=%u", out->device_id,
                 out->has_gateway_mac ? "set" : "none", out->has_lmk ? "set" : "none", out->channel);
    }
    return result;
}

esp_err_t node_config_save_channel(uint8_t channel)
{
    if (channel < 1 || channel > 13) {
        return ESP_ERR_INVALID_ARG;
    }
    nvs_handle_t h;
    esp_err_t err = nvs_open(NS_PAIRING, NVS_READWRITE, &h);
    if (err != ESP_OK) {
        return err;
    }
    uint8_t old = 0;
    if (nvs_get_u8(h, KEY_CHANNEL, &old) != ESP_OK || old != channel) {
        err = nvs_set_u8(h, KEY_CHANNEL, channel);   /* chỉ ghi khi đổi — đỡ mòn flash */
        if (err == ESP_OK) {
            err = nvs_commit(h);
        }
    }
    nvs_close(h);
    return err;
}

esp_err_t node_config_erase_pairing(void)
{
    nvs_handle_t h;
    esp_err_t err = nvs_open(NS_PAIRING, NVS_READWRITE, &h);
    if (err == ESP_ERR_NVS_NOT_FOUND) {
        return ESP_OK;
    }
    if (err != ESP_OK) {
        return err;
    }
    err = nvs_erase_all(h);
    if (err == ESP_OK) {
        err = nvs_commit(h);
    }
    nvs_close(h);
    ESP_LOGW(TAG, "pairing erased");
    return err;
}

void node_config_wipe(node_config_t *cfg)
{
    if (cfg != NULL) {
        mbedtls_platform_zeroize(cfg->device_secret, sizeof(cfg->device_secret));
        mbedtls_platform_zeroize(cfg->lmk, sizeof(cfg->lmk));
        cfg->has_lmk = false;
    }
}
