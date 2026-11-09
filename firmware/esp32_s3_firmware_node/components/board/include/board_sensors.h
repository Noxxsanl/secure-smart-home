/*
 * board_sensors — cảm biến I2C của Node. Hiện có SHT31 (nhiệt độ, độ ẩm).
 *
 * Chân SDA/SCL: menuconfig → "Node S3: cảm biến I2C (SHT31)" (mặc định SDA 15, SCL 7 theo PCB).
 * Tự tìm SHT3x ở 0x44 (ADDR nối GND) rồi 0x45 (ADDR nối VDD). Gọi từ 1 task (không khoá).
 */
#pragma once

#include <stdbool.h>

#include "esp_err.h"

#ifdef __cplusplus
extern "C" {
#endif

/**
 * Lần đầu: khởi tạo bus I2C và log các địa chỉ đang trả lời. Sau đó tìm SHT3x.
 * ESP_ERR_NOT_FOUND nếu chưa thấy cảm biến — bus vẫn giữ, gọi lại để tìm lại (cắm dây sau khi khởi động).
 */
esp_err_t board_sensors_init(void);

bool board_sensors_climate_ready(void);

/** °C và %RH. ESP_ERR_INVALID_STATE nếu chưa tìm thấy cảm biến (board_sensors_init chưa trả ESP_OK). */
esp_err_t board_sensors_read_climate(float *temperature_c, float *humidity_pct);

#ifdef __cplusplus
}
#endif
