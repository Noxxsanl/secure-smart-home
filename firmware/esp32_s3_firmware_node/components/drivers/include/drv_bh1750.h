/*
 * BH1750 / GY-302 — cường độ ánh sáng (lux), I2C.
 * Chế độ đo một lần độ phân giải cao (0x20): ~120–180 ms, tự tắt sau khi đo (đỡ tốn điện, đỡ tự nóng).
 */
#pragma once

#include "driver/i2c_master.h"
#include "esp_err.h"

#ifdef __cplusplus
extern "C" {
#endif

#define DRV_BH1750_ADDR_LOW 0x23    /* chân ADDR nối GND hoặc để hở */
#define DRV_BH1750_ADDR_HIGH 0x5C   /* chân ADDR nối VCC */

typedef struct drv_bh1750 *drv_bh1750_handle_t;

esp_err_t drv_bh1750_init(i2c_master_bus_handle_t bus, uint8_t addr, drv_bh1750_handle_t *out);

/** Chặn ~180 ms. */
esp_err_t drv_bh1750_read(drv_bh1750_handle_t h, float *lux);

esp_err_t drv_bh1750_del(drv_bh1750_handle_t h);

#ifdef __cplusplus
}
#endif
