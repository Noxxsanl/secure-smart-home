#include "drv_xpt2046.h"

#include <stdlib.h>

#include "driver/gpio.h"
#include "esp_check.h"
#include "esp_log.h"
#include "esp_timer.h"

static const char *TAG = "drv_xpt2046";

/*
 * Byte lệnh: S A2 A1 A0 MODE SER/DFR PD1 PD0 — đo 12 bit, vi sai.
 * PD = 00: tắt giữa các lần đo, bật PENIRQ (trạng thái nghỉ). PD = 01: giữ ADC bật giữa các lần đo liên tiếp.
 */
#define CMD_X 0xD0    /* A = 101 */
#define CMD_Y 0x90    /* A = 001 */
#define CMD_Z1 0xB0   /* A = 011 */
#define CMD_Z2 0xC0   /* A = 100 */
#define PD_ADC_ON 0x01

#define DEFAULT_CLOCK_HZ (2 * 1000 * 1000)
#define DEFAULT_Z_THRESHOLD 300
#define SAMPLES 5
#define LOG_INTERVAL_US (200 * 1000)

struct drv_xpt2046 {
    spi_device_handle_t dev;
    drv_xpt2046_config_t cfg;
    int64_t last_log_us;
    bool warned_stuck;
};

/* 1 lệnh + 16 xung đọc: bit bận, 12 bit kết quả (MSB trước), 3 bit 0. */
static esp_err_t measure(struct drv_xpt2046 *h, uint8_t cmd, uint16_t *out)
{
    spi_transaction_t t = {
        .flags = SPI_TRANS_USE_TXDATA | SPI_TRANS_USE_RXDATA,
        .length = 24,
        .tx_data = {cmd, 0, 0, 0},
    };
    ESP_RETURN_ON_ERROR(spi_device_polling_transmit(h->dev, &t), TAG, "spi transfer failed");
    *out = (uint16_t)(((((uint16_t)t.rx_data[1]) << 8) | t.rx_data[2]) >> 3) & 0x0FFF;
    return ESP_OK;
}

static uint16_t median(uint16_t *v, int n)
{
    for (int i = 1; i < n; i++) {
        uint16_t key = v[i];
        int j = i - 1;
        while (j >= 0 && v[j] > key) {
            v[j + 1] = v[j];
            j--;
        }
        v[j + 1] = key;
    }
    return v[n / 2];
}

/* Đo 1 kênh SAMPLES lần, bỏ lần đầu sau khi đổi kênh (thường lệch). */
static esp_err_t measure_axis(struct drv_xpt2046 *h, uint8_t cmd, uint16_t *out)
{
    uint16_t v[SAMPLES];
    uint16_t discard;
    ESP_RETURN_ON_ERROR(measure(h, cmd | PD_ADC_ON, &discard), TAG, "axis");
    for (int i = 0; i < SAMPLES; i++) {
        ESP_RETURN_ON_ERROR(measure(h, cmd | PD_ADC_ON, &v[i]), TAG, "axis");
    }
    *out = median(v, SAMPLES);
    return ESP_OK;
}

static esp_err_t power_down(struct drv_xpt2046 *h)
{
    uint16_t discard;
    return measure(h, CMD_X, &discard);   /* PD = 00: về nghỉ, bật lại PENIRQ */
}

esp_err_t drv_xpt2046_read_raw(drv_xpt2046_handle_t h, uint16_t *x, uint16_t *y, uint16_t *z, bool *pressed)
{
    ESP_RETURN_ON_FALSE(h && x && y && pressed, ESP_ERR_INVALID_ARG, TAG, "null arg");
    *pressed = false;
    if (z) {
        *z = 0;
    }
    /* T_IRQ ở mức cao = không chạm: khỏi chiếm bus SPI của LCD. */
    if (h->cfg.irq_gpio >= 0 && gpio_get_level(h->cfg.irq_gpio) != 0) {
        return ESP_OK;
    }

    uint16_t z1;
    uint16_t z2;
    esp_err_t err = measure(h, CMD_Z1 | PD_ADC_ON, &z1);
    if (err == ESP_OK) {
        err = measure(h, CMD_Z2 | PD_ADC_ON, &z2);
    }
    int pressure = 0;
    if (err == ESP_OK) {
        /* Chạm thật thì Z1 > 0 và Z2 > Z1 (R_touch = R_x * X/4096 * (Z2/Z1 - 1) > 0). MISO kẹt mức 0 (Z1 = Z2 = 0)
         * hoặc mức 1 (Z1 = Z2 = 4095) không phải chạm — trước đây bị tính áp lực 4095 = ấn liên tục. */
        if (z1 > 0 && z2 > z1) {
            pressure = (int)z1 + 4095 - (int)z2;
        } else if (z1 == z2 && (z1 == 0 || z1 == 4095) && !h->warned_stuck) {
            h->warned_stuck = true;
            ESP_LOGW(TAG, "T_DO reads all %s: check T_DO -> MISO wiring and T_CS; LCD SDO must not share MISO",
                     z1 == 0 ? "0" : "1");
        }
    }
    if (err == ESP_OK && pressure >= h->cfg.z_threshold) {
        err = measure_axis(h, CMD_X, x);
        if (err == ESP_OK) {
            err = measure_axis(h, CMD_Y, y);
        }
        *pressed = (err == ESP_OK);
    }
    esp_err_t pd = power_down(h);
    if (z) {
        *z = (uint16_t)(pressure > 4095 ? 4095 : pressure);
    }
    return err != ESP_OK ? err : pd;
}

static int map_axis(uint16_t raw, uint16_t raw_at_0, uint16_t raw_at_end, int size)
{
    int v = ((int)raw - (int)raw_at_0) * (size - 1) / ((int)raw_at_end - (int)raw_at_0);
    if (v < 0) {
        return 0;
    }
    return v >= size ? size - 1 : v;
}

esp_err_t drv_xpt2046_read(drv_xpt2046_handle_t h, int *x, int *y, bool *pressed)
{
    ESP_RETURN_ON_FALSE(h && x && y && pressed, ESP_ERR_INVALID_ARG, TAG, "null arg");
    uint16_t rx;
    uint16_t ry;
    uint16_t rz;
    ESP_RETURN_ON_ERROR(drv_xpt2046_read_raw(h, &rx, &ry, &rz, pressed), TAG, "read");
    if (!*pressed) {
        return ESP_OK;
    }
    const drv_xpt2046_config_t *c = &h->cfg;
    *x = map_axis(c->swap_xy ? ry : rx, c->raw_left, c->raw_right, c->width);
    *y = map_axis(c->swap_xy ? rx : ry, c->raw_top, c->raw_bottom, c->height);

    if (c->log_raw) {
        int64_t now = esp_timer_get_time();
        if (now - h->last_log_us >= LOG_INTERVAL_US) {
            h->last_log_us = now;
            ESP_LOGI(TAG, "raw X=%u Y=%u Z=%u -> (%d, %d)", rx, ry, rz, *x, *y);
        }
    }
    return ESP_OK;
}

esp_err_t drv_xpt2046_init(const drv_xpt2046_config_t *cfg, drv_xpt2046_handle_t *out)
{
    ESP_RETURN_ON_FALSE(cfg && out, ESP_ERR_INVALID_ARG, TAG, "null arg");
    ESP_RETURN_ON_FALSE(cfg->width > 0 && cfg->height > 0, ESP_ERR_INVALID_ARG, TAG, "bad screen size");
    ESP_RETURN_ON_FALSE(cfg->raw_left != cfg->raw_right && cfg->raw_top != cfg->raw_bottom &&
                            cfg->raw_left <= 4095 && cfg->raw_right <= 4095 && cfg->raw_top <= 4095 &&
                            cfg->raw_bottom <= 4095,
                        ESP_ERR_INVALID_ARG, TAG, "bad calibration");

    struct drv_xpt2046 *h = calloc(1, sizeof(*h));
    ESP_RETURN_ON_FALSE(h, ESP_ERR_NO_MEM, TAG, "no mem");
    h->cfg = *cfg;
    if (h->cfg.clock_hz == 0) {
        h->cfg.clock_hz = DEFAULT_CLOCK_HZ;
    }
    if (h->cfg.z_threshold == 0) {
        h->cfg.z_threshold = DEFAULT_Z_THRESHOLD;
    }
    esp_err_t ret = ESP_OK;

    if (cfg->irq_gpio >= 0) {
        gpio_config_t irq = {
            .pin_bit_mask = 1ULL << cfg->irq_gpio,
            .mode = GPIO_MODE_INPUT,
            .pull_up_en = GPIO_PULLUP_ENABLE,   /* PENIRQ kéo xuống khi chạm */
        };
        ESP_GOTO_ON_ERROR(gpio_config(&irq), err, TAG, "irq gpio");
    }

    spi_device_interface_config_t dev = {
        .clock_speed_hz = (int)h->cfg.clock_hz,
        .mode = 0,
        .spics_io_num = cfg->cs_gpio,
        .queue_size = 1,
    };
    ESP_GOTO_ON_ERROR(spi_bus_add_device(cfg->host, &dev, &h->dev), err, TAG, "add device (SPI bus initialised?)");
    ESP_GOTO_ON_ERROR(power_down(h), err, TAG, "power down");

    *out = h;
    ESP_LOGI(TAG, "XPT2046 ready (%d kHz, IRQ %d, %dx%d%s)", (int)(h->cfg.clock_hz / 1000), cfg->irq_gpio,
             cfg->width, cfg->height, cfg->swap_xy ? ", swap XY" : "");
    return ESP_OK;

err:
    if (h->dev) {
        spi_bus_remove_device(h->dev);
    }
    if (cfg->irq_gpio >= 0) {
        gpio_reset_pin(cfg->irq_gpio);
    }
    free(h);
    return ret;
}

esp_err_t drv_xpt2046_del(drv_xpt2046_handle_t h)
{
    ESP_RETURN_ON_FALSE(h, ESP_ERR_INVALID_ARG, TAG, "null arg");
    spi_bus_remove_device(h->dev);
    if (h->cfg.irq_gpio >= 0) {
        gpio_reset_pin(h->cfg.irq_gpio);
    }
    free(h);
    return ESP_OK;
}
