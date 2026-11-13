#include "node_state_store.h"

#include <stdbool.h>
#include <string.h>

#include "esp_check.h"
#include "esp_log.h"
#include "nvs.h"

static const char *TAG = "node_state";

#define NS_LOADS "loads"
#define KEY_MAX 15   /* NVS_KEY_NAME_MAX_SIZE - 1 */

static bool valid_key(const char *key)
{
    if (key == NULL) {
        return false;
    }
    size_t n = strnlen(key, KEY_MAX + 1);
    if (n == 0 || n > KEY_MAX) {
        return false;
    }
    for (size_t i = 0; i < n; i++) {
        char c = key[i];
        if (!((c >= '0' && c <= '9') || (c >= 'a' && c <= 'z') || c == '_')) {
            return false;
        }
    }
    return true;
}

/* nvs_open READONLY trên namespace chưa có trả ESP_ERR_NVS_NOT_FOUND = chưa từng lưu gì. */
static esp_err_t open_ro(nvs_handle_t *h)
{
    esp_err_t err = nvs_open(NS_LOADS, NVS_READONLY, h);
    return err == ESP_ERR_NVS_NOT_FOUND ? ESP_ERR_NOT_FOUND : err;
}

static esp_err_t finish_write(nvs_handle_t h, esp_err_t err, const char *key)
{
    if (err == ESP_OK) {
        err = nvs_commit(h);
    }
    nvs_close(h);
    if (err != ESP_OK) {
        ESP_LOGW(TAG, "save '%s' failed: %s", key, esp_err_to_name(err));
    }
    return err;
}

esp_err_t node_state_get_u8(const char *key, uint8_t *out)
{
    ESP_RETURN_ON_FALSE(valid_key(key) && out, ESP_ERR_INVALID_ARG, TAG, "bad key");
    nvs_handle_t h;
    esp_err_t err = open_ro(&h);
    if (err != ESP_OK) {
        return err;
    }
    err = nvs_get_u8(h, key, out);
    nvs_close(h);
    return err == ESP_ERR_NVS_NOT_FOUND ? ESP_ERR_NOT_FOUND : err;
}

esp_err_t node_state_set_u8(const char *key, uint8_t value)
{
    ESP_RETURN_ON_FALSE(valid_key(key), ESP_ERR_INVALID_ARG, TAG, "bad key");
    nvs_handle_t h;
    ESP_RETURN_ON_ERROR(nvs_open(NS_LOADS, NVS_READWRITE, &h), TAG, "nvs_open");
    return finish_write(h, nvs_set_u8(h, key, value), key);
}

esp_err_t node_state_get_i32(const char *key, int32_t *out)
{
    ESP_RETURN_ON_FALSE(valid_key(key) && out, ESP_ERR_INVALID_ARG, TAG, "bad key");
    nvs_handle_t h;
    esp_err_t err = open_ro(&h);
    if (err != ESP_OK) {
        return err;
    }
    err = nvs_get_i32(h, key, out);
    nvs_close(h);
    return err == ESP_ERR_NVS_NOT_FOUND ? ESP_ERR_NOT_FOUND : err;
}

esp_err_t node_state_set_i32(const char *key, int32_t value)
{
    ESP_RETURN_ON_FALSE(valid_key(key), ESP_ERR_INVALID_ARG, TAG, "bad key");
    nvs_handle_t h;
    ESP_RETURN_ON_ERROR(nvs_open(NS_LOADS, NVS_READWRITE, &h), TAG, "nvs_open");
    return finish_write(h, nvs_set_i32(h, key, value), key);
}
