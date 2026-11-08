/*
 * Cảm ứng điện trở XPT2046 (tương thích ADS7843) — chip cảm ứng của module TFT 3.5" ILI9488 SPI.
 *
 * Đi chung bus SPI với LCD: T_CLK = SCK, T_DIN = MOSI, T_DO = MISO; CS riêng, xung nhịp thấp (chip tối đa 2,5 MHz).
 * MISO của bus CHỈ nối T_DO: SDO của ILI9488 không thả trở kháng cao, nối chung thì đọc cảm ứng sai.
 *
 * Toạ độ: đo ADC 12 bit (0..4095, lọc trung vị 5 lần đo) rồi quy đổi tuyến tính sang điểm ảnh theo 4 số hiệu chuẩn
 * = số đo thô tại 4 mép màn hình theo hướng đang dùng. Mép phải nhỏ hơn mép trái là bình thường (trục ngược), không
 * cần cờ mirror. swap_xy: trục X của màn hình lấy từ kênh Y của chip (màn hình xoay ngang thường cần).
 * Lấy số hiệu chuẩn: bật log_raw, chạm sát 4 mép, đọc log (README của node, mục Màn hình).
 *
 * Không an toàn đa luồng: chỉ gọi từ một task (drv_display gọi trong task LVGL).
 */
#pragma once

#include <stdbool.h>
#include <stdint.h>

#include "driver/spi_master.h"
#include "esp_err.h"

#ifdef __cplusplus
extern "C" {
#endif

typedef struct {
    spi_host_device_t host;   /* bus đã init bằng drv_spi_bus_init() và CÓ miso_gpio (= T_DO) */
    int cs_gpio;              /* T_CS */
    int irq_gpio;             /* T_IRQ (PENIRQ, xuống thấp khi chạm); -1 = không nối, chỉ dựa vào áp lực Z */
    uint32_t clock_hz;        /* 0 = 2 MHz */
    int width;                /* kích thước màn hình theo hướng đang dùng (sau khi xoay) */
    int height;
    bool swap_xy;
    uint16_t raw_left;        /* số đo thô (0..4095) tại mép trái / phải / trên / dưới của màn hình */
    uint16_t raw_right;
    uint16_t raw_top;
    uint16_t raw_bottom;
    uint16_t z_threshold;     /* 0 = 300. Có chạm "ma" thì tăng; phải ấn mạnh mới nhận thì giảm */
    bool log_raw;             /* log số thô khi đang chạm (tối đa 5 dòng/giây) — dùng lúc hiệu chuẩn */
} drv_xpt2046_config_t;

typedef struct drv_xpt2046 *drv_xpt2046_handle_t;

esp_err_t drv_xpt2046_init(const drv_xpt2046_config_t *cfg, drv_xpt2046_handle_t *out);

/** Số đo thô 12 bit đã lọc. *pressed = false thì x, y không có nghĩa. z có thể NULL. */
esp_err_t drv_xpt2046_read_raw(drv_xpt2046_handle_t h, uint16_t *x, uint16_t *y, uint16_t *z, bool *pressed);

/** Toạ độ điểm ảnh đã hiệu chuẩn, kẹp trong [0, width) × [0, height). */
esp_err_t drv_xpt2046_read(drv_xpt2046_handle_t h, int *x, int *y, bool *pressed);

esp_err_t drv_xpt2046_del(drv_xpt2046_handle_t h);

#ifdef __cplusplus
}
#endif
