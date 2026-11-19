#include "drv_mic.h"

#include <inttypes.h>
#include <math.h>
#include <stdlib.h>

#include "esp_check.h"
#include "esp_heap_caps.h"
#include "freertos/FreeRTOS.h"

static const char *TAG = "drv_mic";

#define MIC_DEFAULT_RATE 16000
#define MIC_DEFAULT_SHIFT 14
#define MIC_RAW_CHUNK 256          /* mẫu 32 bit đọc mỗi lần từ DMA */
#define DC_POLE_Q15 32604          /* ~0,995: cắt dưới ~13 Hz ở 16 kHz */

struct drv_mic {
    i2s_chan_handle_t rx;
    int32_t *raw;
    uint8_t shift;
    int32_t dc_prev_x;
    int32_t dc_prev_y;
};

esp_err_t drv_mic_init(const drv_mic_config_t *cfg, drv_mic_handle_t *out)
{
    ESP_RETURN_ON_FALSE(cfg && out, ESP_ERR_INVALID_ARG, TAG, "null arg");
    uint8_t shift = cfg->gain_shift ? cfg->gain_shift : MIC_DEFAULT_SHIFT;
    ESP_RETURN_ON_FALSE(shift >= 8 && shift <= 24, ESP_ERR_INVALID_ARG, TAG, "gain_shift must be 8..24");

    struct drv_mic *h = calloc(1, sizeof(*h));
    ESP_RETURN_ON_FALSE(h, ESP_ERR_NO_MEM, TAG, "no mem");
    h->shift = shift;
    h->raw = heap_caps_malloc(MIC_RAW_CHUNK * sizeof(int32_t), MALLOC_CAP_INTERNAL | MALLOC_CAP_8BIT);
    esp_err_t ret = ESP_OK;
    ESP_GOTO_ON_FALSE(h->raw, ESP_ERR_NO_MEM, err, TAG, "no mem for raw buffer");

    i2s_chan_config_t chan_cfg = I2S_CHANNEL_DEFAULT_CONFIG(cfg->port, I2S_ROLE_MASTER);
    ESP_GOTO_ON_ERROR(i2s_new_channel(&chan_cfg, NULL, &h->rx), err, TAG, "i2s_new_channel failed");

    uint32_t rate = cfg->sample_rate_hz ? cfg->sample_rate_hz : MIC_DEFAULT_RATE;
    i2s_std_config_t std_cfg = {
        .clk_cfg = I2S_STD_CLK_DEFAULT_CONFIG(rate),
        .slot_cfg = I2S_STD_PHILIPS_SLOT_DEFAULT_CONFIG(I2S_DATA_BIT_WIDTH_32BIT, I2S_SLOT_MODE_MONO),
        .gpio_cfg = {
            .mclk = I2S_GPIO_UNUSED,
            .bclk = cfg->bclk_gpio,
            .ws = cfg->ws_gpio,
            .dout = I2S_GPIO_UNUSED,
            .din = cfg->din_gpio,
        },
    };
    std_cfg.slot_cfg.slot_mask = cfg->lr_high ? I2S_STD_SLOT_RIGHT : I2S_STD_SLOT_LEFT;

    ESP_GOTO_ON_ERROR(i2s_channel_init_std_mode(h->rx, &std_cfg), err, TAG, "init std mode failed");
    ESP_GOTO_ON_ERROR(i2s_channel_enable(h->rx), err, TAG, "enable failed");

    *out = h;
    ESP_LOGI(TAG, "INMP441 ready (%" PRIu32 " Hz, %s channel, shift %u)", rate, cfg->lr_high ? "right" : "left",
             shift);
    return ESP_OK;

err:
    if (h->rx) {
        i2s_del_channel(h->rx);
    }
    free(h->raw);
    free(h);
    return ret;
}

static inline int16_t clamp16(int32_t v)
{
    if (v > INT16_MAX) return INT16_MAX;
    if (v < INT16_MIN) return INT16_MIN;
    return (int16_t)v;
}

esp_err_t drv_mic_read(drv_mic_handle_t h, int16_t *pcm, size_t max_samples, size_t *got, uint32_t timeout_ms)
{
    ESP_RETURN_ON_FALSE(h && pcm && got, ESP_ERR_INVALID_ARG, TAG, "null arg");
    *got = 0;
    esp_err_t err = ESP_OK;

    while (*got < max_samples) {
        size_t want = max_samples - *got;
        if (want > MIC_RAW_CHUNK) {
            want = MIC_RAW_CHUNK;
        }
        size_t bytes = 0;
        err = i2s_channel_read(h->rx, h->raw, want * sizeof(int32_t), &bytes, timeout_ms);
        size_t n = bytes / sizeof(int32_t);
        for (size_t i = 0; i < n; i++) {
            /* 24 bit có dấu, căn trái trong khe 32 bit → dịch số học về thang 16 bit. */
            int32_t x = h->raw[i] >> h->shift;
            /* Lọc DC một cực: y = x - x[-1] + a·y[-1] */
            int32_t y = x - h->dc_prev_x + (int32_t)(((int64_t)h->dc_prev_y * DC_POLE_Q15) >> 15);
            h->dc_prev_x = x;
            h->dc_prev_y = y;
            pcm[(*got)++] = clamp16(y);
        }
        if (err != ESP_OK) {
            break;
        }
    }
    return err;
}

float drv_mic_rms_dbfs(const int16_t *pcm, size_t n)
{
    if (pcm == NULL || n == 0) {
        return -96.0f;
    }
    double acc = 0;
    for (size_t i = 0; i < n; i++) {
        acc += (double)pcm[i] * (double)pcm[i];
    }
    double rms = sqrt(acc / (double)n);
    if (rms < 1.0) {
        return -96.0f;
    }
    return (float)(20.0 * log10(rms / 32768.0));
}

esp_err_t drv_mic_del(drv_mic_handle_t h)
{
    if (h == NULL) {
        return ESP_ERR_INVALID_ARG;
    }
    i2s_channel_disable(h->rx);
    i2s_del_channel(h->rx);
    free(h->raw);
    free(h);
    return ESP_OK;
}
