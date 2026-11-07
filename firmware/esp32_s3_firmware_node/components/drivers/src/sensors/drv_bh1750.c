#include "drv_bh1750.h"

#include <stdlib.h>

#include "esp_check.h"
#include "freertos/FreeRTOS.h"
#include "freertos/task.h"

static const char *TAG = "drv_bh1750";

#define BH1750_SCL_HZ 100000
#define BH1750_TIMEOUT_MS 50
#define BH1750_MEAS_WAIT_MS 180

#define BH1750_CMD_POWER_ON 0x01
#define BH1750_CMD_ONE_TIME_HRES 0x20

struct drv_bh1750 {
    i2c_master_dev_handle_t dev;
};

esp_err_t drv_bh1750_init(i2c_master_bus_handle_t bus, uint8_t addr, drv_bh1750_handle_t *out)
{
    ESP_RETURN_ON_FALSE(bus && out, ESP_ERR_INVALID_ARG, TAG, "null arg");
    struct drv_bh1750 *h = calloc(1, sizeof(*h));
    ESP_RETURN_ON_FALSE(h, ESP_ERR_NO_MEM, TAG, "no mem");

    i2c_device_config_t dev_cfg = {
        .dev_addr_length = I2C_ADDR_BIT_LEN_7,
        .device_address = addr,
        .scl_speed_hz = BH1750_SCL_HZ,
    };
    esp_err_t err = i2c_master_bus_add_device(bus, &dev_cfg, &h->dev);
    if (err != ESP_OK) {
        free(h);
        return err;
    }

    const uint8_t cmd = BH1750_CMD_POWER_ON;
    err = i2c_master_transmit(h->dev, &cmd, 1, BH1750_TIMEOUT_MS);
    if (err != ESP_OK) {
        ESP_LOGE(TAG, "no answer at 0x%02x: %s", addr, esp_err_to_name(err));
        i2c_master_bus_rm_device(h->dev);
        free(h);
        return err;
    }
    *out = h;
    ESP_LOGI(TAG, "BH1750 ready at 0x%02x", addr);
    return ESP_OK;
}

esp_err_t drv_bh1750_read(drv_bh1750_handle_t h, float *lux)
{
    ESP_RETURN_ON_FALSE(h && lux, ESP_ERR_INVALID_ARG, TAG, "null arg");

    const uint8_t cmd = BH1750_CMD_ONE_TIME_HRES;
    ESP_RETURN_ON_ERROR(i2c_master_transmit(h->dev, &cmd, 1, BH1750_TIMEOUT_MS), TAG, "start measurement failed");
    vTaskDelay(pdMS_TO_TICKS(BH1750_MEAS_WAIT_MS));

    uint8_t b[2];
    ESP_RETURN_ON_ERROR(i2c_master_receive(h->dev, b, sizeof(b), BH1750_TIMEOUT_MS), TAG, "read failed");
    *lux = (float)((b[0] << 8) | b[1]) / 1.2f;
    return ESP_OK;
}

esp_err_t drv_bh1750_del(drv_bh1750_handle_t h)
{
    if (h == NULL) {
        return ESP_ERR_INVALID_ARG;
    }
    i2c_master_bus_rm_device(h->dev);
    free(h);
    return ESP_OK;
}
