/*
 * board_ir — hồng ngoại của Node: mắt thu VS1838B (RMT RX, có DMA để học mã điều hòa dài) + LED 940 nm (RMT TX,
 * sóng mang 38 kHz). Chân: menuconfig → "Node S3: hồng ngoại (điều hòa)" (mặc định RX GPIO1, TX GPIO2).
 *
 * Định dạng chung: chuỗi thời lượng µs xen kẽ mark (có sóng) / space (im lặng), bắt đầu bằng mark — giống
 * drv_ir_rx/drv_ir_tx và kho mã node_ir_store. Gọi từ 1 task (không khoá).
 */
#pragma once

#include <stdbool.h>
#include <stddef.h>
#include <stdint.h>

#include "esp_err.h"

#ifdef __cplusplus
extern "C" {
#endif

/** Im lặng lâu hơn mức này thì mắt thu coi là hết 1 khung (µs). */
#define BOARD_IR_FRAME_IDLE_US 30000

/** ESP_ERR_NOT_SUPPORTED nếu tắt trong menuconfig. Gọi lại khi đã chạy: ESP_OK. */
esp_err_t board_ir_init(void);

bool board_ir_ready(void);

/** Phát 1 mã (carrier_hz = 0 → 38 kHz). Chặn tới khi phát xong (≤ 1 s). */
esp_err_t board_ir_send(const uint16_t *durations_us, size_t count, uint32_t carrier_hz);

/**
 * Chờ 1 khung từ mắt thu. ESP_ERR_TIMEOUT nếu không có; ESP_ERR_INVALID_SIZE nếu khung dài hơn `cap`.
 * timeout_ms = 0: chỉ lấy khung đã nằm sẵn (dùng để bỏ khung cũ, VD tiếng vọng của LED phát).
 */
esp_err_t board_ir_receive(uint16_t *durations_us, size_t cap, size_t *count, uint32_t timeout_ms);

#ifdef __cplusplus
}
#endif
