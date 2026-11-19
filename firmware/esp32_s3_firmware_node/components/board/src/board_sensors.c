#include "board_sensors.h"

#include "drv_bus.h"
#include "drv_sht3x.h"
#include "esp_check.h"
#include "esp_log.h"
#include "sdkconfig.h"

static const char *TAG = "board_sensors";

#define I2C_PROBE_TIMEOUT_MS 20

static i2c_master_bus_handle_t s_i2c;
static drv_sht3x_handle_t s_sht;

static esp_err_t i2c_init(void)
{
    drv_i2c_bus_config_t cfg = {
        .port = I2C_NUM_0,
        .sda_gpio = CONFIG_NODE_I2C_PIN_SDA,
        .scl_gpio = CONFIG_NODE_I2C_PIN_SCL,
#if CONFIG_NODE_I2C_INTERNAL_PULLUP
        .internal_pullup = true,
#endif
    };
    ESP_RETURN_ON_ERROR(drv_i2c_bus_init(&cfg, &s_i2c), TAG, "I2C bus");
    size_t count = 0;
    return drv_i2c_bus_scan(s_i2c, NULL, 0, &count);   /* log từng địa chỉ trả lời, giúp kiểm dây */
}

esp_err_t board_sensors_init(void)
{
    if (s_sht != NULL) {
        return ESP_OK;
    }
    if (s_i2c == NULL) {
        ESP_RETURN_ON_ERROR(i2c_init(), TAG, "init");
    }
    static const uint8_t addrs[] = {DRV_SHT3X_ADDR_DEFAULT, DRV_SHT3X_ADDR_ALT};
    for (size_t i = 0; i < sizeof(addrs); i++) {
        /* probe trước: địa chỉ không có thiết bị thì im lặng, không để drv_sht3x_init log lỗi mỗi lần thử lại */
        if (i2c_master_probe(s_i2c, addrs[i], I2C_PROBE_TIMEOUT_MS) == ESP_OK &&
            drv_sht3x_init(s_i2c, addrs[i], &s_sht) == ESP_OK) {
            return ESP_OK;
        }
    }
    return ESP_ERR_NOT_FOUND;
}

bool board_sensors_climate_ready(void)
{
    return s_sht != NULL;
}

esp_err_t board_sensors_read_climate(float *temperature_c, float *humidity_pct)
{
    if (s_sht == NULL) {
        return ESP_ERR_INVALID_STATE;
    }
    return drv_sht3x_read(s_sht, temperature_c, humidity_pct);
}
