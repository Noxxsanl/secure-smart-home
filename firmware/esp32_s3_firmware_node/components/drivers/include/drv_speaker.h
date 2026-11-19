/*
 * Loa qua ampli I2S (VD MAX98357A, NS4168) — I2S chuẩn Philips, PCM 16 bit mono gửi lên cả 2 khe.
 *
 * Nối: BCLK → bclk, LRC → ws, DIN → dout. Chân SD/EN của ampli (nếu có) → sd_gpio để tắt ampli khi
 * không phát (đỡ tiếng rè, đỡ tốn điện). Âm lượng chỉnh bằng phần mềm; mức khuếch đại phần cứng
 * (chân GAIN của MAX98357A) đặt trên mạch.
 */
#pragma once

#include <stdbool.h>
#include <stddef.h>
#include <stdint.h>

#include "driver/i2s_std.h"
#include "esp_err.h"

#ifdef __cplusplus
extern "C" {
#endif

typedef struct {
    i2s_port_t port;          /* khuyên I2S_NUM_0 */
    int bclk_gpio;
    int ws_gpio;              /* LRC */
    int dout_gpio;            /* DIN của ampli */
    int sd_gpio;              /* SD/EN của ampli, mức cao = bật; -1 nếu không nối */
    uint32_t sample_rate_hz;  /* 0 = 16000 */
    uint8_t volume_pct;       /* 0..100 lúc khởi tạo */
} drv_speaker_config_t;

typedef struct drv_speaker *drv_speaker_handle_t;

/** Khởi tạo; ampli để TẮT cho tới khi gọi drv_speaker_enable(true) (hoặc drv_speaker_tone tự bật). */
esp_err_t drv_speaker_init(const drv_speaker_config_t *cfg, drv_speaker_handle_t *out);

esp_err_t drv_speaker_enable(drv_speaker_handle_t h, bool on);

esp_err_t drv_speaker_set_volume(drv_speaker_handle_t h, uint8_t volume_pct);

/** Phát PCM 16 bit mono đúng sample_rate đã cấu hình. Chặn tới khi đã đẩy hết vào DMA. */
esp_err_t drv_speaker_write(drv_speaker_handle_t h, const int16_t *pcm, size_t samples, uint32_t timeout_ms);

/** Âm báo hình sin có vào/ra mềm 5 ms (không kêu "bụp"). Dùng cho phản hồi nút bấm, xác nhận lệnh. */
esp_err_t drv_speaker_tone(drv_speaker_handle_t h, uint32_t freq_hz, uint32_t duration_ms);

esp_err_t drv_speaker_del(drv_speaker_handle_t h);

#ifdef __cplusplus
}
#endif
