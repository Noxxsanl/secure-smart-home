#include "gw_i2c.h"

#include <stdbool.h>

#include "driver/i2c.h"
#include "esp_log.h"

static const char *TAG = "gw_i2c";

/* Khớp I2C_MASTER_SDA_IO / I2C_MASTER_SCL_IO / I2C_MASTER_FREQ_HZ của ví dụ Waveshare. */
#define GW_I2C_SDA_GPIO 8
#define GW_I2C_SCL_GPIO 9
#define GW_I2C_FREQ_HZ 400000

static bool s_installed;

void gw_i2c_bus_mark_installed(void)
{
    s_installed = true;
}

esp_err_t gw_i2c_bus_init(void)
{
    if (s_installed) {
        return ESP_OK;
    }
    i2c_config_t conf = {
        .mode = I2C_MODE_MASTER,
        .sda_io_num = GW_I2C_SDA_GPIO,
        .scl_io_num = GW_I2C_SCL_GPIO,
        .sda_pullup_en = GPIO_PULLUP_ENABLE,
        .scl_pullup_en = GPIO_PULLUP_ENABLE,
        .master.clk_speed = GW_I2C_FREQ_HZ,
    };
    esp_err_t err = i2c_param_config(GW_I2C_PORT, &conf);
    if (err == ESP_OK) {
        err = i2c_driver_install(GW_I2C_PORT, conf.mode, 0, 0, 0);
    }
    if (err != ESP_OK) {
        ESP_LOGE(TAG, "I2C bus init failed: %s", esp_err_to_name(err));
        return err;
    }
    s_installed = true;
    return ESP_OK;
}
