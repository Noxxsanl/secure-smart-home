/*
 * board_audio — mic INMP441 (I2S1 RX) + loa qua ampli NS4168 (I2S0 TX) của Node.
 *
 * MẶC ĐỊNH TẮT (menuconfig "Node S3: âm thanh", NODE_AUDIO_ENABLE): code viết sẵn cho tính năng giọng nói sau này.
 * Khi tắt, board_audio_init trả ESP_ERR_NOT_SUPPORTED, không khởi tạo I2S; các hàm khác trả ESP_ERR_INVALID_STATE.
 *
 * Mặc định = PCB: mic SCK 4, WS 5, SD 6 (L/R nối GND → kênh trái); loa BCLK 10, LRCLK 11, DIN 9, CTRL không nối.
 * PCM 16 bit có dấu, mono, tần số lấy mẫu trong menuconfig (mặc định 16 kHz — dạng nhận dạng giọng nói cần).
 */
#pragma once

#include <stdbool.h>
#include <stddef.h>
#include <stdint.h>

#include "esp_err.h"

#ifdef __cplusplus
extern "C" {
#endif

/** Khởi tạo mic + loa. Một bên lỗi thì bên kia vẫn chạy (log cảnh báo); cả hai lỗi → trả lỗi. */
esp_err_t board_audio_init(void);

bool board_audio_mic_ready(void);
bool board_audio_speaker_ready(void);

/** Tần số lấy mẫu đang dùng (Hz); 0 nếu tắt. */
uint32_t board_audio_sample_rate(void);

/** Âm báo hình sin, chặn tới khi đẩy hết vào DMA (≈ duration_ms). */
esp_err_t board_audio_tone(uint32_t freq_hz, uint32_t duration_ms);

/** Phát PCM mono đúng tần số lấy mẫu. Chặn tới khi đẩy hết vào DMA. */
esp_err_t board_audio_play(const int16_t *pcm, size_t samples, uint32_t timeout_ms);

esp_err_t board_audio_set_volume(uint8_t volume_pct);

/** Đọc tối đa max_samples mẫu PCM từ mic (đã lọc DC). ESP_ERR_TIMEOUT nếu chưa đủ mẫu khi hết giờ (got = số đã có). */
esp_err_t board_audio_mic_read(int16_t *pcm, size_t max_samples, size_t *got, uint32_t timeout_ms);

/** Mức âm RMS (dBFS, ~-96 = im lặng) — thử mic / phát hiện có tiếng đơn giản. */
float board_audio_level_dbfs(const int16_t *pcm, size_t n);

#ifdef __cplusplus
}
#endif
