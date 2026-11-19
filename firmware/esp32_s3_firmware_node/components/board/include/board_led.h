/*
 * board_led — LED RGB WS2812 1 bóng báo trạng thái (debug) của Node. Chân + độ sáng: menuconfig
 * "Node S3: LED debug (WS2812)" (mặc định DIN GPIO40, 10 %). Ý nghĩa màu do application quyết định (node_status_led).
 */
#pragma once

#include <stdbool.h>
#include <stdint.h>

#include "esp_err.h"

#ifdef __cplusplus
extern "C" {
#endif

/** Khởi tạo và tắt LED. ESP_ERR_NOT_SUPPORTED nếu tắt trong menuconfig. Gọi lại khi đã chạy: ESP_OK. */
esp_err_t board_led_init(void);

bool board_led_ready(void);

/** Màu 0..255 mỗi kênh, tự nhân độ sáng trong menuconfig. Gọi từ 1 task (task LED của application). */
esp_err_t board_led_set(uint8_t r, uint8_t g, uint8_t b);

#ifdef __cplusplus
}
#endif
