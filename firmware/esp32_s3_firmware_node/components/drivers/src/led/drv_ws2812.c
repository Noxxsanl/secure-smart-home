#include "drv_ws2812.h"

#include <stdlib.h>
#include <string.h>

#include "driver/gpio.h"
#include "driver/rmt_encoder.h"
#include "driver/rmt_tx.h"
#include "esp_check.h"
#include "esp_heap_caps.h"
#include "esp_log.h"
#include "freertos/FreeRTOS.h"
#include "freertos/semphr.h"

static const char *TAG = "drv_ws2812";

#define WS_RESOLUTION_HZ 10000000   /* 1 tick = 0,1 µs */
#define WS_T0H 3                    /* bit 0: cao 0,3 µs, thấp 0,9 µs */
#define WS_T0L 9
#define WS_T1H 9                    /* bit 1: cao 0,9 µs, thấp 0,3 µs */
#define WS_T1L 3
#define WS_RESET_HALF 1500          /* ký hiệu cuối: thấp 2 × 150 µs = mã reset (≥ 280 µs cho WS2812B đời mới) */
#define WS_MAX_LEDS 64
#define WS_BITS_PER_LED 24
#define WS_TX_TIMEOUT_MS 100

struct drv_ws2812 {
    rmt_channel_handle_t chan;
    rmt_encoder_handle_t enc;
    SemaphoreHandle_t lock;
    size_t count;
    uint8_t *grb;              /* 3 byte / LED theo thứ tự gửi: G, R, B */
    rmt_symbol_word_t *sym;    /* 24 ký hiệu / LED + 1 ký hiệu reset; RAM trong vì ngắt RMT đọc */
};

esp_err_t drv_ws2812_init(const drv_ws2812_config_t *cfg, drv_ws2812_handle_t *out)
{
    ESP_RETURN_ON_FALSE(cfg && out, ESP_ERR_INVALID_ARG, TAG, "null arg");
    ESP_RETURN_ON_FALSE(cfg->led_count >= 1 && cfg->led_count <= WS_MAX_LEDS, ESP_ERR_INVALID_ARG, TAG,
                        "led_count must be 1..%d", WS_MAX_LEDS);
    ESP_RETURN_ON_FALSE(GPIO_IS_VALID_OUTPUT_GPIO(cfg->gpio), ESP_ERR_INVALID_ARG, TAG, "invalid gpio %d", cfg->gpio);

    struct drv_ws2812 *h = calloc(1, sizeof(*h));
    ESP_RETURN_ON_FALSE(h, ESP_ERR_NO_MEM, TAG, "no mem");
    h->count = cfg->led_count;

    esp_err_t ret = ESP_OK;
    h->lock = xSemaphoreCreateMutex();
    h->grb = calloc(h->count, 3);
    h->sym = heap_caps_calloc(h->count * WS_BITS_PER_LED + 1, sizeof(rmt_symbol_word_t),
                              MALLOC_CAP_INTERNAL | MALLOC_CAP_8BIT);
    ESP_GOTO_ON_FALSE(h->lock && h->grb && h->sym, ESP_ERR_NO_MEM, err, TAG, "no mem");

    rmt_tx_channel_config_t tx_cfg = {
        .gpio_num = cfg->gpio,
        .clk_src = RMT_CLK_SRC_DEFAULT,
        .resolution_hz = WS_RESOLUTION_HZ,
        .mem_block_symbols = 48,   /* 1 khối của ESP32-S3; dải dài hơn được nạp tiếp kiểu ping-pong */
        .trans_queue_depth = 2,
    };
    ESP_GOTO_ON_ERROR(rmt_new_tx_channel(&tx_cfg, &h->chan), err, TAG, "rmt_new_tx_channel failed");
    rmt_copy_encoder_config_t enc_cfg = {};
    ESP_GOTO_ON_ERROR(rmt_new_copy_encoder(&enc_cfg, &h->enc), err, TAG, "copy encoder failed");
    ESP_GOTO_ON_ERROR(rmt_enable(h->chan), err, TAG, "rmt_enable failed");

    *out = h;
    ESP_GOTO_ON_ERROR(drv_ws2812_clear(h), err_enabled, TAG, "first frame failed");
    ESP_LOGI(TAG, "%u LED(s) on GPIO %d", (unsigned)h->count, cfg->gpio);
    return ESP_OK;

err_enabled:
    rmt_disable(h->chan);
err:
    if (h->enc) {
        rmt_del_encoder(h->enc);
    }
    if (h->chan) {
        rmt_del_channel(h->chan);
    }
    if (h->lock) {
        vSemaphoreDelete(h->lock);
    }
    free(h->grb);
    free(h->sym);
    free(h);
    *out = NULL;
    return ret;
}

esp_err_t drv_ws2812_set(drv_ws2812_handle_t h, size_t index, uint8_t r, uint8_t g, uint8_t b)
{
    ESP_RETURN_ON_FALSE(h && index < h->count, ESP_ERR_INVALID_ARG, TAG, "bad index");
    xSemaphoreTake(h->lock, portMAX_DELAY);
    h->grb[3 * index] = g;
    h->grb[3 * index + 1] = r;
    h->grb[3 * index + 2] = b;
    xSemaphoreGive(h->lock);
    return ESP_OK;
}

esp_err_t drv_ws2812_show(drv_ws2812_handle_t h)
{
    ESP_RETURN_ON_FALSE(h, ESP_ERR_INVALID_ARG, TAG, "null arg");
    static const rmt_symbol_word_t bit0 = {.level0 = 1, .duration0 = WS_T0H, .level1 = 0, .duration1 = WS_T0L};
    static const rmt_symbol_word_t bit1 = {.level0 = 1, .duration0 = WS_T1H, .level1 = 0, .duration1 = WS_T1L};
    static const rmt_symbol_word_t reset = {
        .level0 = 0, .duration0 = WS_RESET_HALF, .level1 = 0, .duration1 = WS_RESET_HALF};

    xSemaphoreTake(h->lock, portMAX_DELAY);
    size_t n = 0;
    for (size_t i = 0; i < h->count * 3; i++) {
        for (int bit = 7; bit >= 0; bit--) {   /* MSB trước */
            h->sym[n++] = ((h->grb[i] >> bit) & 1u) ? bit1 : bit0;
        }
    }
    h->sym[n++] = reset;
    const rmt_transmit_config_t tc = {.loop_count = 0, .flags.eot_level = 0};
    esp_err_t err = rmt_transmit(h->chan, h->enc, h->sym, n * sizeof(rmt_symbol_word_t), &tc);
    if (err == ESP_OK) {
        err = rmt_tx_wait_all_done(h->chan, WS_TX_TIMEOUT_MS);   /* bộ đệm ký hiệu phải sống tới khi gửi xong */
    }
    xSemaphoreGive(h->lock);
    if (err != ESP_OK) {
        ESP_LOGW(TAG, "show failed: %s", esp_err_to_name(err));
    }
    return err;
}

esp_err_t drv_ws2812_clear(drv_ws2812_handle_t h)
{
    ESP_RETURN_ON_FALSE(h, ESP_ERR_INVALID_ARG, TAG, "null arg");
    xSemaphoreTake(h->lock, portMAX_DELAY);
    memset(h->grb, 0, h->count * 3);
    xSemaphoreGive(h->lock);
    return drv_ws2812_show(h);
}

esp_err_t drv_ws2812_del(drv_ws2812_handle_t h)
{
    if (h == NULL) {
        return ESP_ERR_INVALID_ARG;
    }
    drv_ws2812_clear(h);
    rmt_disable(h->chan);
    rmt_del_encoder(h->enc);
    rmt_del_channel(h->chan);
    vSemaphoreDelete(h->lock);
    free(h->grb);
    free(h->sym);
    free(h);
    return ESP_OK;
}
