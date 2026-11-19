/*
 * node_audio — mic INMP441 + loa NS4168 cho các tính năng giọng nói sau này (riêng của application).
 *
 * MẶC ĐỊNH TẮT (menuconfig "Node S3: âm thanh" → NODE_AUDIO_ENABLE): node_audio_start trả ESP_ERR_NOT_SUPPORTED và
 * mọi hàm khác không làm gì / trả ESP_ERR_INVALID_STATE — nơi gọi (node_switches, node_curtain) không cần kiểm.
 *
 * Bật lên thì có sẵn:
 *   - bíp xác nhận khi bật/tắt đèn, quạt, rèm (NODE_AUDIO_BEEP_ON_ACTION) — phát trong task riêng, không chặn người gọi;
 *   - node_audio_play_pcm / node_audio_read_mic cho tính năng mới (VD nhận lệnh giọng nói, đọc thông báo);
 *   - [thử mic] in mức âm dBFS ra log mỗi 5 giây (NODE_AUDIO_MIC_SELFTEST).
 */
#pragma once

#include <stdbool.h>
#include <stddef.h>
#include <stdint.h>

#include "esp_err.h"

#ifdef __cplusplus
extern "C" {
#endif

typedef enum {
    NODE_AUDIO_BEEP_ON = 0,   /* bật / mở: 1 tiếng cao */
    NODE_AUDIO_BEEP_OFF,      /* tắt / đóng: 1 tiếng trầm */
    NODE_AUDIO_BEEP_ERROR,    /* lỗi: tiếng trầm dài */
} node_audio_beep_t;

/** ESP_ERR_NOT_SUPPORTED nếu tắt trong menuconfig. */
esp_err_t node_audio_start(void);

bool node_audio_ready(void);

/** Không chặn. Không làm gì nếu âm thanh tắt / chưa chạy / tắt bíp trong menuconfig. */
void node_audio_beep(node_audio_beep_t kind);

/** Phát PCM 16 bit mono đúng node_audio_sample_rate(). Chặn tới khi đẩy hết vào DMA — gọi từ task của tính năng. */
esp_err_t node_audio_play_pcm(const int16_t *pcm, size_t samples, uint32_t timeout_ms);

/** Đọc PCM 16 bit mono từ mic. Không dùng cùng lúc với chế độ thử mic (NODE_AUDIO_MIC_SELFTEST). */
esp_err_t node_audio_read_mic(int16_t *pcm, size_t max_samples, size_t *got, uint32_t timeout_ms);

/** Hz; 0 nếu tắt. */
uint32_t node_audio_sample_rate(void);

#ifdef __cplusplus
}
#endif
