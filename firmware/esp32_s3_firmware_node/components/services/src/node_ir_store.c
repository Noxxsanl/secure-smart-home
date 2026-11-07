#include "node_ir_store.h"

#include <stdlib.h>
#include <string.h>

#include "esp_check.h"
#include "nvs.h"

static const char *TAG = "node_ir_store";

#define NS_IR "ir_codes"
#define BLOB_VERSION 1

typedef struct __attribute__((packed)) {
    uint8_t version;
    uint8_t reserved;
    uint16_t count;
    uint32_t carrier_hz;
} ir_blob_header_t;

bool node_ir_store_valid_name(const char *name)
{
    if (name == NULL) {
        return false;
    }
    size_t n = strnlen(name, NODE_IR_NAME_MAX + 1);
    if (n == 0 || n > NODE_IR_NAME_MAX) {
        return false;
    }
    for (size_t i = 0; i < n; i++) {
        char c = name[i];
        if (!((c >= '0' && c <= '9') || (c >= 'a' && c <= 'z') || c == '_')) {
            return false;
        }
    }
    return true;
}

esp_err_t node_ir_store_save(const char *name, uint32_t carrier_hz, const uint16_t *durations_us, size_t count)
{
    ESP_RETURN_ON_FALSE(node_ir_store_valid_name(name), ESP_ERR_INVALID_ARG, TAG, "bad name");
    ESP_RETURN_ON_FALSE(durations_us && count > 0 && count <= NODE_IR_MAX_DURATIONS, ESP_ERR_INVALID_SIZE, TAG,
                        "bad length");

    size_t size = sizeof(ir_blob_header_t) + count * sizeof(uint16_t);
    uint8_t *blob = malloc(size);
    ESP_RETURN_ON_FALSE(blob, ESP_ERR_NO_MEM, TAG, "no mem");
    ir_blob_header_t hdr = {.version = BLOB_VERSION, .count = (uint16_t)count, .carrier_hz = carrier_hz};
    memcpy(blob, &hdr, sizeof(hdr));
    memcpy(blob + sizeof(hdr), durations_us, count * sizeof(uint16_t));

    nvs_handle_t h;
    esp_err_t err = nvs_open(NS_IR, NVS_READWRITE, &h);
    if (err == ESP_OK) {
        err = nvs_set_blob(h, name, blob, size);
        if (err == ESP_OK) {
            err = nvs_commit(h);
        }
        nvs_close(h);
    }
    free(blob);
    if (err == ESP_OK) {
        ESP_LOGI(TAG, "saved IR code '%s' (%u durations, %u Hz)", name, (unsigned)count, (unsigned)carrier_hz);
    } else {
        ESP_LOGE(TAG, "save '%s' failed: %s", name, esp_err_to_name(err));
    }
    return err;
}

esp_err_t node_ir_store_load(const char *name, uint32_t *carrier_hz, uint16_t *durations_us, size_t cap,
                             size_t *count)
{
    ESP_RETURN_ON_FALSE(node_ir_store_valid_name(name), ESP_ERR_INVALID_ARG, TAG, "bad name");
    ESP_RETURN_ON_FALSE(carrier_hz && durations_us && count, ESP_ERR_INVALID_ARG, TAG, "null arg");
    *count = 0;

    nvs_handle_t h;
    esp_err_t err = nvs_open(NS_IR, NVS_READONLY, &h);
    if (err == ESP_ERR_NVS_NOT_FOUND) {
        return ESP_ERR_NOT_FOUND;
    }
    ESP_RETURN_ON_ERROR(err, TAG, "nvs_open failed");

    size_t size = 0;
    err = nvs_get_blob(h, name, NULL, &size);
    if (err == ESP_ERR_NVS_NOT_FOUND) {
        nvs_close(h);
        return ESP_ERR_NOT_FOUND;
    }
    uint8_t *blob = NULL;
    if (err == ESP_OK) {
        if (size < sizeof(ir_blob_header_t) ||
            size > sizeof(ir_blob_header_t) + NODE_IR_MAX_DURATIONS * sizeof(uint16_t)) {
            err = ESP_ERR_INVALID_SIZE;
        } else {
            blob = malloc(size);
            err = blob ? nvs_get_blob(h, name, blob, &size) : ESP_ERR_NO_MEM;
        }
    }
    nvs_close(h);

    if (err == ESP_OK) {
        ir_blob_header_t hdr;
        memcpy(&hdr, blob, sizeof(hdr));
        if (hdr.version != BLOB_VERSION || size != sizeof(hdr) + (size_t)hdr.count * sizeof(uint16_t)) {
            ESP_LOGW(TAG, "IR code '%s' corrupted or unknown version", name);
            err = ESP_ERR_INVALID_VERSION;
        } else if (hdr.count > cap) {
            err = ESP_ERR_INVALID_SIZE;
        } else {
            memcpy(durations_us, blob + sizeof(hdr), (size_t)hdr.count * sizeof(uint16_t));
            *carrier_hz = hdr.carrier_hz;
            *count = hdr.count;
        }
    }
    free(blob);
    return err;
}

esp_err_t node_ir_store_erase(const char *name)
{
    ESP_RETURN_ON_FALSE(node_ir_store_valid_name(name), ESP_ERR_INVALID_ARG, TAG, "bad name");
    nvs_handle_t h;
    esp_err_t err = nvs_open(NS_IR, NVS_READWRITE, &h);
    if (err != ESP_OK) {
        return err;
    }
    err = nvs_erase_key(h, name);
    if (err == ESP_OK) {
        err = nvs_commit(h);
    }
    nvs_close(h);
    return err == ESP_ERR_NVS_NOT_FOUND ? ESP_ERR_NOT_FOUND : err;
}
