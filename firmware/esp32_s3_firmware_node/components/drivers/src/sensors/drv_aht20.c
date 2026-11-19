#include "drv_aht20.h"

#include <stdlib.h>

#include "crc8.h"
#include "esp_check.h"
#include "freertos/FreeRTOS.h"
#include "freertos/task.h"

static const char *TAG = "drv_aht20";

#define AHT20_SCL_HZ 100000
#define AHT20_TIMEOUT_MS 50
#define AHT20_POWERON_MS 40
#define AHT20_MEAS_WAIT_MS 80
#define AHT20_BUSY_RETRY_MS 20

#define AHT20_STATUS_BUSY 0x80
#define AHT20_STATUS_CAL 0x08

struct drv_aht20 {
    i2c_master_dev_handle_t dev;
};

static esp_err_t read_status(struct drv_aht20 *h, uint8_t *status)
{
    const uint8_t cmd = 0x71;
    return i2c_master_transmit_receive(h->dev, &cmd, 1, status, 1, AHT20_TIMEOUT_MS);
}

esp_err_t drv_aht20_init(i2c_master_bus_handle_t bus, drv_aht20_handle_t *out)
{
    ESP_RETURN_ON_FALSE(bus && out, ESP_ERR_INVALID_ARG, TAG, "null arg");
    struct drv_aht20 *h = calloc(1, sizeof(*h));
    ESP_RETURN_ON_FALSE(h, ESP_ERR_NO_MEM, TAG, "no mem");

    i2c_device_config_t dev_cfg = {
        .dev_addr_length = I2C_ADDR_BIT_LEN_7,
        .device_address = DRV_AHT20_ADDR,
        .scl_speed_hz = AHT20_SCL_HZ,
    };
    esp_err_t err = i2c_master_bus_add_device(bus, &dev_cfg, &h->dev);
    if (err != ESP_OK) {
        free(h);
        return err;
    }

    vTaskDelay(pdMS_TO_TICKS(AHT20_POWERON_MS));
    uint8_t status = 0;
    err = read_status(h, &status);
    if (err == ESP_OK && !(status & AHT20_STATUS_CAL)) {
        const uint8_t calibrate[3] = {0xBE, 0x08, 0x00};
        err = i2c_master_transmit(h->dev, calibrate, sizeof(calibrate), AHT20_TIMEOUT_MS);
        vTaskDelay(pdMS_TO_TICKS(10));
    }
    if (err != ESP_OK) {
        ESP_LOGE(TAG, "no answer at 0x%02x: %s", DRV_AHT20_ADDR, esp_err_to_name(err));
        i2c_master_bus_rm_device(h->dev);
        free(h);
        return err;
    }
    *out = h;
    ESP_LOGI(TAG, "AHT20 ready");
    return ESP_OK;
}

esp_err_t drv_aht20_read(drv_aht20_handle_t h, float *temperature_c, float *humidity_pct)
{
    ESP_RETURN_ON_FALSE(h && temperature_c && humidity_pct, ESP_ERR_INVALID_ARG, TAG, "null arg");

    const uint8_t trigger[3] = {0xAC, 0x33, 0x00};
    ESP_RETURN_ON_ERROR(i2c_master_transmit(h->dev, trigger, sizeof(trigger), AHT20_TIMEOUT_MS), TAG,
                        "trigger failed");
    vTaskDelay(pdMS_TO_TICKS(AHT20_MEAS_WAIT_MS));

    uint8_t b[7];
    for (int attempt = 0; attempt < 2; attempt++) {
        ESP_RETURN_ON_ERROR(i2c_master_receive(h->dev, b, sizeof(b), AHT20_TIMEOUT_MS), TAG, "read failed");
        if (!(b[0] & AHT20_STATUS_BUSY)) {
            break;
        }
        if (attempt == 1) {
            return ESP_ERR_TIMEOUT;
        }
        vTaskDelay(pdMS_TO_TICKS(AHT20_BUSY_RETRY_MS));
    }
    if (drv_crc8_31(b, 6) != b[6]) {
        ESP_LOGW(TAG, "CRC mismatch");
        return ESP_ERR_INVALID_CRC;
    }

    uint32_t raw_h = ((uint32_t)b[1] << 12) | ((uint32_t)b[2] << 4) | (b[3] >> 4);
    uint32_t raw_t = ((uint32_t)(b[3] & 0x0F) << 16) | ((uint32_t)b[4] << 8) | b[5];
    *humidity_pct = (float)raw_h * 100.0f / 1048576.0f;
    *temperature_c = (float)raw_t * 200.0f / 1048576.0f - 50.0f;
    return ESP_OK;
}

esp_err_t drv_aht20_del(drv_aht20_handle_t h)
{
    if (h == NULL) {
        return ESP_ERR_INVALID_ARG;
    }
    i2c_master_bus_rm_device(h->dev);
    free(h);
    return ESP_OK;
}
