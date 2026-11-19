/*
 * gw_i2c — bus I2C chung của board: SDA GPIO8, SCL GPIO9, 400 kHz (cảm ứng GT911 0x5D, CH422G 0x24/0x38,
 * RTC PCF85063 0x51, header I2C ngoài). Khớp I2C_MASTER_* trong src/lcd/waveshare_rgb_lcd_port.h.
 *
 * Dùng driver I2C CŨ (driver/i2c.h) như code Waveshare; driver cũ tự khoá mutex theo cổng nên nhiều task gọi được.
 */
#pragma once

#include "esp_err.h"

#ifdef __cplusplus
extern "C" {
#endif

#define GW_I2C_PORT 0
#define GW_I2C_TIMEOUT_MS 100

/** Cài driver nếu chưa cài (gọi nhiều lần được). */
esp_err_t gw_i2c_bus_init(void);

/** Báo bus đã được code khác cài (ví dụ Waveshare tự cài khi bật cảm ứng) để không cài lần 2. */
void gw_i2c_bus_mark_installed(void);

#ifdef __cplusplus
}
#endif
