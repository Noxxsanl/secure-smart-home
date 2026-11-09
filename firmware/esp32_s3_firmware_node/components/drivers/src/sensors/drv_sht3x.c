#include "drv_sht3x.h"

#include <stdlib.h>

#include "crc8.h"
#include "esp_check.h"
#include "freertos/FreeRTOS.h"
#include "freertos/task.h"

static const char *TAG = "drv_sht3x";

#define SHT3X_SCL_HZ 100000
#define SHT3X_TIMEOUT_MS 50
#define SHT3X_MEAS_WAIT_MS 16   /* tối đa 15,5 ms ở độ lặp lại cao */
#define SHT3X_RESET_WAIT_MS 2   /* tối đa 1,5 ms sau soft reset */

/* pdMS_TO_TICKS làm tròn XUỐNG và vTaskDelay(n) chỉ chờ (n-1, n] tick: cộng 1 tick để luôn chờ đủ ms, kể cả
 * khi tick 10 ms (CONFIG_FREERTOS_HZ=100: 16 ms thành 1 tick = có thể chỉ 0 ms, đọc bị NACK). */
#define WAIT_TICKS(ms) (pdMS_TO_TICKS(ms) + 1)

struct drv_sht3x {
    i2c_master_dev_handle_t dev;
};

static const uint8_t CMD_MEAS_HIGH_NOSTRETCH[2] = {0x24, 0x00};
static const uint8_t CMD_SOFT_RESET[2] = {0x30, 0xA2};

esp_err_t drv_sht3x_init(i2c_master_bus_handle_t bus, uint8_t addr, drv_sht3x_handle_t *out)
{
    ESP_RETURN_ON_FALSE(bus && out, ESP_ERR_INVALID_ARG, TAG, "null arg");
    struct drv_sht3x *h = calloc(1, sizeof(*h));
    ESP_RETURN_ON_FALSE(h, ESP_ERR_NO_MEM, TAG, "no mem");

    i2c_device_config_t dev_cfg = {
        .dev_addr_length = I2C_ADDR_BIT_LEN_7,
        .device_address = addr,
        .scl_speed_hz = SHT3X_SCL_HZ,
    };
    esp_err_t err = i2c_master_bus_add_device(bus, &dev_cfg, &h->dev);
    if (err != ESP_OK) {
        free(h);
        ESP_LOGE(TAG, "add device 0x%02x failed: %s", addr, esp_err_to_name(err));
        return err;
    }

    err = i2c_master_transmit(h->dev, CMD_SOFT_RESET, sizeof(CMD_SOFT_RESET), SHT3X_TIMEOUT_MS);
    if (err != ESP_OK) {
        ESP_LOGE(TAG, "no answer at 0x%02x: %s", addr, esp_err_to_name(err));
        i2c_master_bus_rm_device(h->dev);
        free(h);
        return err;
    }
    vTaskDelay(WAIT_TICKS(SHT3X_RESET_WAIT_MS));
    *out = h;
    ESP_LOGI(TAG, "SHT3x ready at 0x%02x", addr);
    return ESP_OK;
}

esp_err_t drv_sht3x_read(drv_sht3x_handle_t h, float *temperature_c, float *humidity_pct)
{
    ESP_RETURN_ON_FALSE(h && temperature_c && humidity_pct, ESP_ERR_INVALID_ARG, TAG, "null arg");

    ESP_RETURN_ON_ERROR(i2c_master_transmit(h->dev, CMD_MEAS_HIGH_NOSTRETCH, 2, SHT3X_TIMEOUT_MS), TAG,
                        "start measurement failed");
    vTaskDelay(WAIT_TICKS(SHT3X_MEAS_WAIT_MS));

    uint8_t b[6];
    ESP_RETURN_ON_ERROR(i2c_master_receive(h->dev, b, sizeof(b), SHT3X_TIMEOUT_MS), TAG, "read failed");
    if (drv_crc8_31(&b[0], 2) != b[2] || drv_crc8_31(&b[3], 2) != b[5]) {
        ESP_LOGW(TAG, "CRC mismatch");
        return ESP_ERR_INVALID_CRC;
    }

    uint16_t raw_t = (uint16_t)((b[0] << 8) | b[1]);
    uint16_t raw_h = (uint16_t)((b[3] << 8) | b[4]);
    *temperature_c = -45.0f + 175.0f * (float)raw_t / 65535.0f;
    *humidity_pct = 100.0f * (float)raw_h / 65535.0f;
    return ESP_OK;
}

esp_err_t drv_sht3x_del(drv_sht3x_handle_t h)
{
    if (h == NULL) {
        return ESP_ERR_INVALID_ARG;
    }
    i2c_master_bus_rm_device(h->dev);
    free(h);
    return ESP_OK;
}
