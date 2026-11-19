#include "drv_speaker.h"

#include <inttypes.h>
#include <math.h>
#include <stdlib.h>

#include "driver/gpio.h"
#include "esp_check.h"
#include "esp_heap_caps.h"
#include "freertos/FreeRTOS.h"
#include "freertos/semphr.h"
#include "freertos/task.h"

static const char *TAG = "drv_speaker";

#define SPK_DEFAULT_RATE 16000
#define SPK_CHUNK 256                 /* mẫu mỗi lần ghi DMA */
#define SPK_FADE_MS 5
#define SPK_TONE_AMPLITUDE 0.6f       /* trước khi nhân âm lượng — chừa khoảng tránh méo */
#define SPK_WRITE_TIMEOUT_MS 1000
#define SPK_AMP_WAKE_MS 10

struct drv_speaker {
    i2s_chan_handle_t tx;
    int16_t *buf;
    int sd_gpio;
    uint32_t rate;
    int32_t gain_q15;
    SemaphoreHandle_t lock;
};

static int32_t volume_to_gain(uint8_t pct)
{
    if (pct > 100) {
        pct = 100;
    }
    /* Cong bậc 2 gần với cảm nhận âm lượng của tai hơn tuyến tính. */
    return (int32_t)((uint32_t)pct * pct * 32767u / 10000u);
}

esp_err_t drv_speaker_init(const drv_speaker_config_t *cfg, drv_speaker_handle_t *out)
{
    ESP_RETURN_ON_FALSE(cfg && out, ESP_ERR_INVALID_ARG, TAG, "null arg");
    struct drv_speaker *h = calloc(1, sizeof(*h));
    ESP_RETURN_ON_FALSE(h, ESP_ERR_NO_MEM, TAG, "no mem");
    h->sd_gpio = cfg->sd_gpio;
    h->rate = cfg->sample_rate_hz ? cfg->sample_rate_hz : SPK_DEFAULT_RATE;
    h->gain_q15 = volume_to_gain(cfg->volume_pct);

    esp_err_t ret = ESP_OK;
    h->buf = heap_caps_malloc(SPK_CHUNK * sizeof(int16_t), MALLOC_CAP_INTERNAL | MALLOC_CAP_8BIT);
    h->lock = xSemaphoreCreateMutex();
    ESP_GOTO_ON_FALSE(h->buf && h->lock, ESP_ERR_NO_MEM, err, TAG, "no mem");

    if (h->sd_gpio >= 0) {
        /* Đặt mức trước khi bật output để ampli không bật thoáng qua lúc khởi động. */
        gpio_set_level(h->sd_gpio, 0);
        gpio_config_t io = {
            .pin_bit_mask = 1ULL << h->sd_gpio,
            .mode = GPIO_MODE_OUTPUT,
        };
        ESP_GOTO_ON_ERROR(gpio_config(&io), err, TAG, "sd gpio config failed");
    }

    i2s_chan_config_t chan_cfg = I2S_CHANNEL_DEFAULT_CONFIG(cfg->port, I2S_ROLE_MASTER);
    chan_cfg.auto_clear = true;   /* hết dữ liệu thì gửi 0 thay vì lặp lại khung cũ (tiếng rè) */
    ESP_GOTO_ON_ERROR(i2s_new_channel(&chan_cfg, &h->tx, NULL), err, TAG, "i2s_new_channel failed");

    i2s_std_config_t std_cfg = {
        .clk_cfg = I2S_STD_CLK_DEFAULT_CONFIG(h->rate),
        .slot_cfg = I2S_STD_PHILIPS_SLOT_DEFAULT_CONFIG(I2S_DATA_BIT_WIDTH_16BIT, I2S_SLOT_MODE_MONO),
        .gpio_cfg = {
            .mclk = I2S_GPIO_UNUSED,
            .bclk = cfg->bclk_gpio,
            .ws = cfg->ws_gpio,
            .dout = cfg->dout_gpio,
            .din = I2S_GPIO_UNUSED,
        },
    };
    /* Mono gửi cùng dữ liệu lên cả 2 khe: ampli đặt chế độ (L+R)/2 vẫn ra đủ biên độ. */
    std_cfg.slot_cfg.slot_mask = I2S_STD_SLOT_BOTH;
    ESP_GOTO_ON_ERROR(i2s_channel_init_std_mode(h->tx, &std_cfg), err, TAG, "init std mode failed");
    ESP_GOTO_ON_ERROR(i2s_channel_enable(h->tx), err, TAG, "enable failed");

    *out = h;
    ESP_LOGI(TAG, "speaker ready (%" PRIu32 " Hz, volume %u%%)", h->rate, cfg->volume_pct);
    return ESP_OK;

err:
    if (h->tx) {
        i2s_del_channel(h->tx);
    }
    if (h->lock) {
        vSemaphoreDelete(h->lock);
    }
    free(h->buf);
    free(h);
    return ret;
}

esp_err_t drv_speaker_enable(drv_speaker_handle_t h, bool on)
{
    ESP_RETURN_ON_FALSE(h, ESP_ERR_INVALID_ARG, TAG, "null arg");
    if (h->sd_gpio < 0) {
        return ESP_OK;
    }
    gpio_set_level(h->sd_gpio, on ? 1 : 0);
    if (on) {
        vTaskDelay(pdMS_TO_TICKS(SPK_AMP_WAKE_MS));
    }
    return ESP_OK;
}

esp_err_t drv_speaker_set_volume(drv_speaker_handle_t h, uint8_t volume_pct)
{
    ESP_RETURN_ON_FALSE(h, ESP_ERR_INVALID_ARG, TAG, "null arg");
    h->gain_q15 = volume_to_gain(volume_pct);
    return ESP_OK;
}

static inline int16_t apply_gain(int32_t sample, int32_t gain_q15)
{
    int32_t v = (sample * gain_q15) >> 15;
    if (v > INT16_MAX) return INT16_MAX;
    if (v < INT16_MIN) return INT16_MIN;
    return (int16_t)v;
}

/* Gọi khi đã giữ h->lock. */
static esp_err_t write_chunk(struct drv_speaker *h, size_t n, uint32_t timeout_ms)
{
    size_t written = 0;
    return i2s_channel_write(h->tx, h->buf, n * sizeof(int16_t), &written, timeout_ms);
}

esp_err_t drv_speaker_write(drv_speaker_handle_t h, const int16_t *pcm, size_t samples, uint32_t timeout_ms)
{
    ESP_RETURN_ON_FALSE(h && (pcm || samples == 0), ESP_ERR_INVALID_ARG, TAG, "null arg");
    xSemaphoreTake(h->lock, portMAX_DELAY);
    esp_err_t err = ESP_OK;
    int32_t gain = h->gain_q15;
    for (size_t off = 0; off < samples && err == ESP_OK; off += SPK_CHUNK) {
        size_t n = samples - off;
        if (n > SPK_CHUNK) {
            n = SPK_CHUNK;
        }
        for (size_t i = 0; i < n; i++) {
            h->buf[i] = apply_gain(pcm[off + i], gain);
        }
        err = write_chunk(h, n, timeout_ms);
    }
    xSemaphoreGive(h->lock);
    return err;
}

esp_err_t drv_speaker_tone(drv_speaker_handle_t h, uint32_t freq_hz, uint32_t duration_ms)
{
    ESP_RETURN_ON_FALSE(h, ESP_ERR_INVALID_ARG, TAG, "null arg");
    ESP_RETURN_ON_FALSE(freq_hz > 0 && freq_hz < h->rate / 2, ESP_ERR_INVALID_ARG, TAG, "freq out of range");

    size_t total = (size_t)((uint64_t)h->rate * duration_ms / 1000);
    size_t fade = (size_t)(h->rate * SPK_FADE_MS / 1000);
    if (fade * 2 > total) {
        fade = total / 2;
    }
    const float step = 2.0f * (float)M_PI * (float)freq_hz / (float)h->rate;

    drv_speaker_enable(h, true);
    xSemaphoreTake(h->lock, portMAX_DELAY);
    esp_err_t err = ESP_OK;
    int32_t gain = h->gain_q15;
    float phase = 0;
    for (size_t off = 0; off < total && err == ESP_OK; off += SPK_CHUNK) {
        size_t n = total - off;
        if (n > SPK_CHUNK) {
            n = SPK_CHUNK;
        }
        for (size_t i = 0; i < n; i++) {
            size_t k = off + i;
            float env = 1.0f;
            if (fade > 0 && k < fade) {
                env = (float)k / (float)fade;
            } else if (fade > 0 && k >= total - fade) {
                env = (float)(total - k) / (float)fade;
            }
            int32_t s = (int32_t)(sinf(phase) * env * SPK_TONE_AMPLITUDE * 32767.0f);
            h->buf[i] = apply_gain(s, gain);
            phase += step;
            if (phase > 2.0f * (float)M_PI) {
                phase -= 2.0f * (float)M_PI;
            }
        }
        err = write_chunk(h, n, SPK_WRITE_TIMEOUT_MS);
    }
    xSemaphoreGive(h->lock);
    return err;
}

esp_err_t drv_speaker_del(drv_speaker_handle_t h)
{
    if (h == NULL) {
        return ESP_ERR_INVALID_ARG;
    }
    drv_speaker_enable(h, false);
    i2s_channel_disable(h->tx);
    i2s_del_channel(h->tx);
    vSemaphoreDelete(h->lock);
    free(h->buf);
    free(h);
    return ESP_OK;
}
