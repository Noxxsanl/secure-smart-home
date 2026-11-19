/*
 * TFT 3.5" ILI9488 320×480 qua SPI 4 dây — cài theo giao diện esp_lcd_panel_t của ESP-IDF, nên dùng được
 * với esp_lcd_panel_draw_bitmap() và sau này với LVGL (esp_lvgl_port) mà không sửa driver.
 *
 * Điểm khác ILI9341/ST7789: ở chế độ SPI, ILI9488 KHÔNG nhận màu 16 bit, chỉ nhận 18 bit (3 byte/điểm).
 * Driver nhận RGB565 (thứ tự byte của CPU, LVGL không bật đảo byte) rồi tự đổi sang RGB666 theo từng
 * khúc, qua 2 bộ đệm DMA luân phiên.
 *
 * Phần cứng:
 *   - Không nối MISO (SDO) của module vào bus: nhiều module ILI9488 không thả SDO về trở kháng cao,
 *     làm hỏng bus nếu sau này gắn thêm cảm ứng XPT2046 / thẻ SD chung SPI.
 *   - Đèn nền thường ăn 60–100 mA: kích qua transistor nếu module không có sẵn.
 */
#pragma once

#include <stdbool.h>
#include <stddef.h>
#include <stdint.h>

#include "driver/spi_master.h"
#include "esp_err.h"
#include "esp_lcd_panel_dev.h"
#include "esp_lcd_panel_io.h"
#include "esp_lcd_panel_ops.h"

#ifdef __cplusplus
extern "C" {
#endif

#define DRV_ILI9488_H_RES 320
#define DRV_ILI9488_V_RES 480

typedef enum {
    DRV_ILI9488_ROT_0 = 0,   /* dọc 320×480 */
    DRV_ILI9488_ROT_90,      /* ngang 480×320 */
    DRV_ILI9488_ROT_180,
    DRV_ILI9488_ROT_270,
} drv_ili9488_rotation_t;

typedef struct {
    spi_host_device_t host;   /* bus đã khởi tạo bằng drv_spi_bus_init() */
    int cs_gpio;
    int dc_gpio;
    int rst_gpio;             /* -1 = reset mềm bằng lệnh */
    int bl_gpio;              /* -1 = đèn nền nối cứng, không chỉnh được */
    bool bl_active_low;
    int bl_ledc_timer;        /* LEDC timer 0..3 cho PWM đèn nền */
    int bl_ledc_channel;      /* LEDC channel 0..7 */
    uint32_t pclk_hz;         /* 0 = 40 MHz; dây dài / nhiễu thì hạ 20–26 MHz */
    bool bgr;                 /* đa số module 3.5" là BGR — đỏ và xanh dương bị đảo thì đổi cờ này */
    bool invert_color;
    size_t chunk_pixels;      /* điểm ảnh đổi màu mỗi lượt, 0 = 320 × 10 (2 bộ đệm × 9,6 KB RAM DMA) */
} drv_ili9488_config_t;

typedef struct drv_ili9488 *drv_ili9488_handle_t;

/**
 * Tạo panel IO SPI + panel, reset, nạp chuỗi khởi tạo, xoá màn hình đen, bật hiển thị.
 * Đèn nền để 0% — gọi drv_ili9488_set_backlight() sau khi vẽ khung đầu (tránh nháy rác).
 */
esp_err_t drv_ili9488_init(const drv_ili9488_config_t *cfg, drv_ili9488_handle_t *out);

esp_lcd_panel_handle_t drv_ili9488_panel(drv_ili9488_handle_t h);
esp_lcd_panel_io_handle_t drv_ili9488_io(drv_ili9488_handle_t h);

esp_err_t drv_ili9488_set_rotation(drv_ili9488_handle_t h, drv_ili9488_rotation_t rot);
void drv_ili9488_get_size(drv_ili9488_handle_t h, int *width, int *height);

esp_err_t drv_ili9488_set_backlight(drv_ili9488_handle_t h, uint8_t percent);

/** Tô 1 hình chữ nhật một màu (RGB565). Dùng để thử màn hình, xoá nền. */
esp_err_t drv_ili9488_fill(drv_ili9488_handle_t h, int x, int y, int w, int hgt, uint16_t rgb565);

/**
 * Chờ mọi khúc màu đang truyền DMA (draw_bitmap/fill trả về trước khi truyền xong) xong hẳn, bằng 1 lệnh NOP.
 * Gọi trước khi thiết bị khác CHUNG bus SPI (cảm ứng XPT2046) dùng polling — không thì có thể gặp
 * "assert failed: spi_hal_setup_trans ... spi_ll_get_running_cmd(hw) == 0". Gọi từ task đang vẽ (task LVGL).
 */
esp_err_t drv_ili9488_wait_idle(drv_ili9488_handle_t h);

esp_err_t drv_ili9488_del(drv_ili9488_handle_t h);

/**
 * Tạo panel kiểu esp_lcd thuần trên 1 panel IO có sẵn (lcd_cmd_bits = lcd_param_bits = 8).
 * bits_per_pixel: 16 (RGB565, tự đổi sang 18 bit) hoặc 24 (RGB888, gửi thẳng — bộ đệm phải nằm ở RAM DMA).
 */
esp_err_t drv_ili9488_new_panel(esp_lcd_panel_io_handle_t io, const esp_lcd_panel_dev_config_t *dev_cfg,
                                size_t chunk_pixels, esp_lcd_panel_handle_t *ret_panel);

#ifdef __cplusplus
}
#endif
