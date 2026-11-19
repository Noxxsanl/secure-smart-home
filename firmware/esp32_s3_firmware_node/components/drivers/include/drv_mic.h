/*
 * Mic MEMS INMP441 — I2S chuẩn Philips, 24 bit trong khe 32 bit, mono.
 *
 * Nối: SCK → bclk, WS → ws, SD → din, L/R → GND (kênh trái, mặc định) hoặc VDD (kênh phải), VDD 3,3 V.
 * Xuất PCM 16 bit có dấu, đã lọc thành phần một chiều (DC) — dạng mà nhận dạng từ khoá / STT thường cần.
 * Dùng cổng I2S riêng với loa (S3 có I2S0, I2S1) để 2 bên không phụ thuộc xung nhịp của nhau.
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
    i2s_port_t port;          /* khuyên I2S_NUM_1 (I2S_NUM_0 để cho loa) */
    int bclk_gpio;            /* SCK */
    int ws_gpio;              /* WS */
    int din_gpio;             /* SD */
    uint32_t sample_rate_hz;  /* 0 = 16000 (giọng nói) */
    bool lr_high;             /* chân L/R nối VDD → đọc kênh phải */
    uint8_t gain_shift;       /* 32 bit → 16 bit: dịch phải bao nhiêu bit. 16 = không khuếch đại, 14 = ×4. 0 = 14 */
} drv_mic_config_t;

typedef struct drv_mic *drv_mic_handle_t;

/** Khởi tạo và bật kênh thu luôn. */
esp_err_t drv_mic_init(const drv_mic_config_t *cfg, drv_mic_handle_t *out);

/**
 * Đọc tối đa `max_samples` mẫu PCM 16 bit. `got` = số mẫu thực có (kể cả khi hết giờ).
 * Trả ESP_ERR_TIMEOUT nếu hết `timeout_ms` trước khi đủ mẫu.
 */
esp_err_t drv_mic_read(drv_mic_handle_t h, int16_t *pcm, size_t max_samples, size_t *got, uint32_t timeout_ms);

/** Mức âm RMS theo dBFS (0 = to nhất, ~-90 = im lặng). Dùng để thử mic hoặc làm VAD đơn giản. */
float drv_mic_rms_dbfs(const int16_t *pcm, size_t n);

esp_err_t drv_mic_del(drv_mic_handle_t h);

#ifdef __cplusplus
}
#endif
