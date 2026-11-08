/*
 * board_display — màn hình của Node: TFT 3.5" ILI9488 (SPI) + cảm ứng điện trở XPT2046 + LVGL 8.4.
 * Tương đương gw_display của Gateway.
 *
 * Chân, hướng, xung nhịp, hiệu chuẩn cảm ứng: menuconfig → "Node S3: màn hình (ILI9488 + cảm ứng XPT2046)".
 * LVGL không an toàn đa luồng: lv_* ngoài task LVGL phải nằm giữa drv_display_lock/unlock (drv_display.h).
 */
#pragma once

#include <stdbool.h>
#include <stdint.h>

#include "esp_err.h"

#ifdef __cplusplus
extern "C" {
#endif

/**
 * Bus SPI2 → ILI9488 (xoay theo menuconfig) → LVGL (task ở nhân 1) → cảm ứng XPT2046 nếu bật. Gọi 1 lần.
 * Đèn nền để tắt: tạo màn hình đầu rồi gọi board_display_backlight_on() (tránh nháy rác).
 * Cảm ứng lỗi khi init thì chỉ cảnh báo, màn hình vẫn chạy.
 */
esp_err_t board_display_init(void);

/** Bật đèn nền theo độ sáng trong menuconfig. */
esp_err_t board_display_backlight_on(void);

/** 0..100 %. ESP_ERR_NOT_SUPPORTED nếu chân đèn nền là -1. */
esp_err_t board_display_backlight(uint8_t percent);

bool board_display_touch_enabled(void);

#ifdef __cplusplus
}
#endif
