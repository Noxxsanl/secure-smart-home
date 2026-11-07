#include "drv_bus.h"

#include "driver/gpio.h"
#include "esp_check.h"
#include "esp_log.h"

static const char *TAG = "drv_bus";

#define I2C_PROBE_TIMEOUT_MS 20
#define SPI_DEFAULT_MAX_TRANSFER (32 * 1024)

esp_err_t drv_i2c_bus_init(const drv_i2c_bus_config_t *cfg, i2c_master_bus_handle_t *out)
{
    ESP_RETURN_ON_FALSE(cfg && out, ESP_ERR_INVALID_ARG, TAG, "null arg");
    ESP_RETURN_ON_FALSE(GPIO_IS_VALID_OUTPUT_GPIO(cfg->sda_gpio) && GPIO_IS_VALID_OUTPUT_GPIO(cfg->scl_gpio),
                        ESP_ERR_INVALID_ARG, TAG, "invalid SDA/SCL gpio");

    i2c_master_bus_config_t bus_cfg = {
        .i2c_port = cfg->port,
        .sda_io_num = cfg->sda_gpio,
        .scl_io_num = cfg->scl_gpio,
        .clk_source = I2C_CLK_SRC_DEFAULT,
        .glitch_ignore_cnt = 7,
        .flags.enable_internal_pullup = cfg->internal_pullup,
    };
    ESP_RETURN_ON_ERROR(i2c_new_master_bus(&bus_cfg, out), TAG, "i2c_new_master_bus failed");
    ESP_LOGI(TAG, "I2C bus ready (SDA %d, SCL %d%s)", cfg->sda_gpio, cfg->scl_gpio,
             cfg->internal_pullup ? ", internal pull-up" : "");
    return ESP_OK;
}

esp_err_t drv_i2c_bus_scan(i2c_master_bus_handle_t bus, uint8_t *found, size_t cap, size_t *count)
{
    ESP_RETURN_ON_FALSE(bus && count, ESP_ERR_INVALID_ARG, TAG, "null arg");
    size_t n = 0;
    for (uint16_t addr = 0x08; addr <= 0x77; addr++) {
        if (i2c_master_probe(bus, addr, I2C_PROBE_TIMEOUT_MS) == ESP_OK) {
            ESP_LOGI(TAG, "I2C device at 0x%02x", addr);
            if (found != NULL && n < cap) {
                found[n] = (uint8_t)addr;
            }
            n++;
        }
    }
    *count = n;
    if (n == 0) {
        ESP_LOGW(TAG, "no I2C device answered — check wiring, power and pull-ups");
    }
    return ESP_OK;
}

esp_err_t drv_spi_bus_init(const drv_spi_bus_config_t *cfg)
{
    ESP_RETURN_ON_FALSE(cfg, ESP_ERR_INVALID_ARG, TAG, "null arg");
    spi_bus_config_t bus_cfg = {
        .sclk_io_num = cfg->sclk_gpio,
        .mosi_io_num = cfg->mosi_gpio,
        .miso_io_num = cfg->miso_gpio,
        .quadwp_io_num = -1,
        .quadhd_io_num = -1,
        .max_transfer_sz = cfg->max_transfer_bytes ? (int)cfg->max_transfer_bytes : SPI_DEFAULT_MAX_TRANSFER,
    };
    esp_err_t err = spi_bus_initialize(cfg->host, &bus_cfg, SPI_DMA_CH_AUTO);
    if (err == ESP_OK) {
        ESP_LOGI(TAG, "SPI%d bus ready (SCLK %d, MOSI %d, MISO %d)", cfg->host + 1, cfg->sclk_gpio, cfg->mosi_gpio,
                 cfg->miso_gpio);
    } else if (err != ESP_ERR_INVALID_STATE) {
        ESP_LOGE(TAG, "spi_bus_initialize failed: %s", esp_err_to_name(err));
    }
    return err;
}
