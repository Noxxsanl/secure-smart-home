/*
 * LED địa chỉ hoá WS2812B / SK6812 (1 dây dữ liệu, thứ tự màu GRB) bằng RMT TX.
 *
 * Nối: DIN của LED → gpio (nên qua trở 220–470 Ω), VDD 5 V hoặc 3,3 V, chung GND. Mức logic 3,3 V của ESP32-S3 đủ
 * cho hầu hết WS2812B khi LED cấp 3,3–5 V; dây dài hoặc LED kén mức thì thêm IC dịch mức.
 *
 * Không dùng thư viện led_strip của Component Registry: bộ mã hoá là copy encoder của ESP-IDF với chuỗi ký hiệu RMT
 * dựng sẵn (24 ký hiệu / LED, độ phân giải 0,1 µs). Mỗi lần drv_ws2812_show gửi cả dải; khoảng nghỉ ≥ 300 µs giữa 2 lần
 * gửi (mã reset) là chuyện tự nhiên vì tầng trên cập nhật vài chục ms một lần.
 */
#pragma once

#include <stddef.h>
#include <stdint.h>

#include "esp_err.h"

#ifdef __cplusplus
extern "C" {
#endif

typedef struct {
    int gpio;
    size_t led_count;   /* 1..64 */
} drv_ws2812_config_t;

typedef struct drv_ws2812 *drv_ws2812_handle_t;

/** Khởi tạo kênh RMT và tắt hết LED. */
esp_err_t drv_ws2812_init(const drv_ws2812_config_t *cfg, drv_ws2812_handle_t *out);

/** Đặt màu 1 LED trong bộ đệm (chưa gửi). */
esp_err_t drv_ws2812_set(drv_ws2812_handle_t h, size_t index, uint8_t r, uint8_t g, uint8_t b);

/** Gửi bộ đệm ra dải LED, chặn tới khi gửi xong (≈ 30 µs / LED). */
esp_err_t drv_ws2812_show(drv_ws2812_handle_t h);

/** Tắt hết (đặt 0 rồi gửi). */
esp_err_t drv_ws2812_clear(drv_ws2812_handle_t h);

esp_err_t drv_ws2812_del(drv_ws2812_handle_t h);

#ifdef __cplusplus
}
#endif
