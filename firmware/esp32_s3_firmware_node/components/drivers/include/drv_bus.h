/*
 * drv_bus — khởi tạo bus dùng chung cho các driver thiết bị.
 *
 *   I2C master: SHT3x / AHT20 / BH1750 cùng 1 bus (mỗi cảm biến 1 địa chỉ).
 *   SPI master: LCD ILI9488 (sau này có thể thêm cảm ứng XPT2046 / thẻ SD trên cùng bus).
 *
 * Chân GPIO do tầng trên truyền vào — thư viện không có chân cứng.
 */
#pragma once

#include <stdbool.h>
#include <stddef.h>
#include <stdint.h>

#include "driver/i2c_master.h"
#include "driver/spi_master.h"
#include "esp_err.h"

#ifdef __cplusplus
extern "C" {
#endif

typedef struct {
    i2c_port_num_t port;   /* I2C_NUM_0 / I2C_NUM_1, -1 = để driver tự chọn */
    int sda_gpio;
    int scl_gpio;
    bool internal_pullup;  /* chỉ đủ cho thử nhanh ở 100 kHz; mạch thật nên có trở kéo lên 4,7 kΩ */
} drv_i2c_bus_config_t;

esp_err_t drv_i2c_bus_init(const drv_i2c_bus_config_t *cfg, i2c_master_bus_handle_t *out);

/**
 * Quét địa chỉ 7-bit 0x08..0x77 và ghi các địa chỉ có ACK vào `found` (tối đa `cap`).
 * Dùng khi lắp mạch để biết cảm biến nào đang trả lời (SHT3x 0x44/0x45, AHT20 0x38, BH1750 0x23/0x5C).
 */
esp_err_t drv_i2c_bus_scan(i2c_master_bus_handle_t bus, uint8_t *found, size_t cap, size_t *count);

typedef struct {
    spi_host_device_t host;     /* SPI2_HOST. Chân IOMUX của SPI2: SCLK 12, MOSI 11, MISO 13, CS 10 */
    int sclk_gpio;
    int mosi_gpio;
    int miso_gpio;              /* -1 nếu không đọc (khuyên KHÔNG nối MISO của ILI9488, xem README) */
    size_t max_transfer_bytes;  /* 0 = 32 KB */
} drv_spi_bus_config_t;

/** ESP_ERR_INVALID_STATE nếu bus đã được khởi tạo (có thể bỏ qua khi nhiều thiết bị dùng chung). */
esp_err_t drv_spi_bus_init(const drv_spi_bus_config_t *cfg);

#ifdef __cplusplus
}
#endif
