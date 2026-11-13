/*
 * Đèn flash LED trắng của ESP32-CAM AI-Thinker (GPIO4, qua transistor — sáng mạnh, dòng lớn).
 *
 * Nháy theo chu kỳ: sáng on_ms rồi tắt, lặp lại mỗi period_ms. Độ sáng chỉnh bằng PWM (LEDC) để giảm dòng đỉnh:
 * đèn sáng hết cỡ cùng lúc WiFi phát dễ làm sụt nguồn 5 V yếu → brownout reset (README, Xử lý sự cố).
 *
 * LEDC_TIMER_0 + LEDC_CHANNEL_0 (low-speed) đã dành cho XCLK 20 MHz của OV2640 (cam_camera.c) → đèn dùng
 * LEDC_TIMER_1 + LEDC_CHANNEL_1, cùng nguồn clock APB (các timer low-speed của ESP32 dùng chung nguồn clock).
 *
 * Đèn nằm cạnh ống kính: lúc đèn sáng, khung hình/ảnh chụp sáng hơn — giảm độ sáng hoặc tắt nháy nếu ảnh bị chói.
 */
#pragma once

#include <stdbool.h>
#include <stdint.h>
#include "esp_err.h"

/**
 * Bắt đầu nháy: sáng on_ms (≥ 1, < period_ms) mỗi period_ms (≥ 20), độ sáng brightness_pct (1–100 %).
 * Gọi 1 lần. Lỗi cấu hình LEDC hoặc thiếu bộ nhớ → trả lỗi, đèn tắt.
 */
esp_err_t cam_led_blink_start(uint32_t period_ms, uint32_t on_ms, uint8_t brightness_pct);

/**
 * Tạm dừng (true) hoặc tiếp tục (false) nháy mà không dừng task: lúc tạm dừng đèn luôn tắt, chu kỳ giữ nguyên.
 * Dùng khi phát luồng MJPEG — đèn cạnh ống kính làm các khung lúc sáng lúc tối. Không làm gì nếu chưa gọi
 * cam_led_blink_start() thành công. An toàn gọi từ task bất kỳ.
 */
void cam_led_pause(bool pause);
