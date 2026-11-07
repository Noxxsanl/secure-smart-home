/*
 * SHT30/SHT31/SHT35 — nhiệt độ + độ ẩm, I2C.
 * Đo một lần, độ lặp lại cao, không kéo giãn xung nhịp (lệnh 0x2400), ~15 ms. Kiểm CRC từng từ.
 */
#pragma once

#include "driver/i2c_master.h"
#include "esp_err.h"

#ifdef __cplusplus
extern "C" {
#endif

#define DRV_SHT3X_ADDR_DEFAULT 0x44   /* chân ADDR nối GND */
#define DRV_SHT3X_ADDR_ALT 0x45       /* chân ADDR nối VDD */

typedef struct drv_sht3x *drv_sht3x_handle_t;

esp_err_t drv_sht3x_init(i2c_master_bus_handle_t bus, uint8_t addr, drv_sht3x_handle_t *out);

/** ESP_ERR_INVALID_CRC nếu dữ liệu hỏng trên đường truyền. */
esp_err_t drv_sht3x_read(drv_sht3x_handle_t h, float *temperature_c, float *humidity_pct);

esp_err_t drv_sht3x_del(drv_sht3x_handle_t h);

#ifdef __cplusplus
}
#endif
