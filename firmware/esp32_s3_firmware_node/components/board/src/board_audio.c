#include "board_audio.h"

#include "drv_mic.h"
#include "drv_speaker.h"
#include "esp_check.h"
#include "esp_log.h"
#include "sdkconfig.h"

static const char *TAG = "board_audio";

static drv_mic_handle_t s_mic;
static drv_speaker_handle_t s_spk;
static uint32_t s_rate;

esp_err_t board_audio_init(void)
{
#if CONFIG_NODE_AUDIO_ENABLE
    if (s_mic != NULL || s_spk != NULL) {
        return ESP_OK;
    }
    /* Mic và loa mỗi bên 1 cổng I2S (khác chân xung nhịp) để không phụ thuộc nhau. */
    const drv_mic_config_t mic = {
        .port = I2S_NUM_1,
        .bclk_gpio = CONFIG_NODE_MIC_PIN_SCK,
        .ws_gpio = CONFIG_NODE_MIC_PIN_WS,
        .din_gpio = CONFIG_NODE_MIC_PIN_SD,
        .sample_rate_hz = CONFIG_NODE_AUDIO_SAMPLE_RATE,
#if CONFIG_NODE_MIC_RIGHT_CHANNEL
        .lr_high = true,
#endif
    };
    esp_err_t mic_err = drv_mic_init(&mic, &s_mic);
    if (mic_err != ESP_OK) {
        ESP_LOGW(TAG, "mic INMP441 not started (%s): check SCK/WS/SD in menuconfig", esp_err_to_name(mic_err));
    }

    const drv_speaker_config_t spk = {
        .port = I2S_NUM_0,
        .bclk_gpio = CONFIG_NODE_SPK_PIN_BCLK,
        .ws_gpio = CONFIG_NODE_SPK_PIN_LRCLK,
        .dout_gpio = CONFIG_NODE_SPK_PIN_DIN,
        .sd_gpio = CONFIG_NODE_SPK_PIN_CTRL,
        .sample_rate_hz = CONFIG_NODE_AUDIO_SAMPLE_RATE,
        .volume_pct = CONFIG_NODE_SPK_VOLUME,
    };
    esp_err_t spk_err = drv_speaker_init(&spk, &s_spk);
    if (spk_err != ESP_OK) {
        ESP_LOGW(TAG, "speaker NS4168 not started (%s): check BCLK/LRCLK/DIN in menuconfig", esp_err_to_name(spk_err));
    }

    if (mic_err != ESP_OK && spk_err != ESP_OK) {
        return mic_err;
    }
    s_rate = CONFIG_NODE_AUDIO_SAMPLE_RATE;
    return ESP_OK;
#else
    return ESP_ERR_NOT_SUPPORTED;
#endif
}

bool board_audio_mic_ready(void)
{
    return s_mic != NULL;
}

bool board_audio_speaker_ready(void)
{
    return s_spk != NULL;
}

uint32_t board_audio_sample_rate(void)
{
    return s_rate;
}

esp_err_t board_audio_tone(uint32_t freq_hz, uint32_t duration_ms)
{
    ESP_RETURN_ON_FALSE(s_spk != NULL, ESP_ERR_INVALID_STATE, TAG, "speaker not initialised");
    return drv_speaker_tone(s_spk, freq_hz, duration_ms);
}

esp_err_t board_audio_play(const int16_t *pcm, size_t samples, uint32_t timeout_ms)
{
    ESP_RETURN_ON_FALSE(s_spk != NULL, ESP_ERR_INVALID_STATE, TAG, "speaker not initialised");
    ESP_RETURN_ON_ERROR(drv_speaker_enable(s_spk, true), TAG, "amp enable");
    return drv_speaker_write(s_spk, pcm, samples, timeout_ms);
}

esp_err_t board_audio_set_volume(uint8_t volume_pct)
{
    ESP_RETURN_ON_FALSE(s_spk != NULL, ESP_ERR_INVALID_STATE, TAG, "speaker not initialised");
    return drv_speaker_set_volume(s_spk, volume_pct);
}

esp_err_t board_audio_mic_read(int16_t *pcm, size_t max_samples, size_t *got, uint32_t timeout_ms)
{
    ESP_RETURN_ON_FALSE(s_mic != NULL, ESP_ERR_INVALID_STATE, TAG, "mic not initialised");
    return drv_mic_read(s_mic, pcm, max_samples, got, timeout_ms);
}

float board_audio_level_dbfs(const int16_t *pcm, size_t n)
{
    return drv_mic_rms_dbfs(pcm, n);
}
