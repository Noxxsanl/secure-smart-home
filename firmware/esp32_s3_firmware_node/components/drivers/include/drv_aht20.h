/*
 * AHT20 / AHT21 — nhiệt độ + độ ẩm, I2C địa chỉ cố định 0x38.
 * Lệnh đo 0xAC 0x33 0x00, chờ ~80 ms, đọc 7 byte (có CRC). Tự hiệu chuẩn (0xBE) nếu bit CAL chưa bật.
 * Không dùng cho AHT10 (khác lệnh khởi tạo, không có byte CRC).
 */
#pragma once

#include "driver/i2c_master.h"
#include "esp_err.h"

#ifdef __cplusplus
extern "C" {
#endif

#define DRV_AHT20_ADDR 0x38

typedef struct drv_aht20 *drv_aht20_handle_t;

esp_err_t drv_aht20_init(i2c_master_bus_handle_t bus, drv_aht20_handle_t *out);

/** ESP_ERR_INVALID_CRC nếu dữ liệu hỏng, ESP_ERR_TIMEOUT nếu cảm biến vẫn bận sau thời gian chờ. */
esp_err_t drv_aht20_read(drv_aht20_handle_t h, float *temperature_c, float *humidity_pct);

esp_err_t drv_aht20_del(drv_aht20_handle_t h);

#ifdef __cplusplus
}
#endif
