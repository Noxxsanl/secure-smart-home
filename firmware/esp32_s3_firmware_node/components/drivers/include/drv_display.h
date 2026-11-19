/*
 * drv_display — LVGL 8.4 trên TFT ILI9488 (drv_ili9488). Cùng bản LVGL với Gateway (08_lvgl_Porting).
 *
 * Gồm: đăng ký màn hình với LVGL (flush qua esp_lcd_panel_draw_bitmap), nhịp tick 2 ms bằng esp_timer,
 * task gọi lv_timer_handler(), khoá đệ quy.
 *
 * LVGL KHÔNG an toàn đa luồng: mọi lời gọi lv_* ngoài callback của LVGL phải nằm giữa
 * drv_display_lock/unlock. Callback lv_timer và sự kiện widget chạy trong task LVGL, đã giữ khoá sẵn.
 *
 * Màu: LVGL xuất RGB565 thứ tự byte CPU, KHÔNG bật LV_COLOR_16_SWAP (sdkconfig.defaults). drv_ili9488 tự đổi
 * sang RGB666 cho SPI; bật nhầm thì build báo lỗi ở drv_display.c.
 * Cảm ứng: drv_display_add_touch() gắn XPT2046 làm thiết bị trỏ (đọc trong task LVGL, chung bus SPI với LCD).
 */
#pragma once

#include <stdbool.h>
#include <stddef.h>

#include "drv_ili9488.h"
#include "drv_xpt2046.h"
#include "esp_err.h"
#include "lvgl.h"

#ifdef __cplusplus
extern "C" {
#endif

typedef struct {
    int task_core;       /* -1 = không ghim nhân; mặc định 1, để nhân 0 cho WiFi/ESP-NOW */
    int task_priority;
    size_t task_stack;   /* byte */
    int buf_lines;       /* số dòng của bộ đệm vẽ: rộng × buf_lines × 2 byte (40 dòng dọc ≈ 25 KB) */
    bool buf_psram;      /* false: SRAM nội, vẽ nhanh hơn; true: PSRAM, chừa SRAM cho WiFi */
} drv_display_config_t;

#define DRV_DISPLAY_CONFIG_DEFAULT() {                                          \
    .task_core = 1, .task_priority = 2, .task_stack = 6 * 1024, .buf_lines = 40, \
    .buf_psram = false,                                                          \
}

/**
 * Khởi tạo LVGL cho màn hình đã init bằng drv_ili9488_init(). Gọi 1 lần.
 * Kích thước LVGL lấy theo hướng hiện tại của panel: gọi drv_ili9488_set_rotation() TRƯỚC hàm này.
 * cfg = NULL → DRV_DISPLAY_CONFIG_DEFAULT(). out_disp có thể NULL.
 * Không đụng đèn nền: tạo màn hình đầu (trong lock/unlock) rồi mới drv_ili9488_set_backlight(), tránh nháy rác.
 */
esp_err_t drv_display_init(drv_ili9488_handle_t lcd, const drv_display_config_t *cfg, lv_disp_t **out_disp);

/**
 * Gắn cảm ứng XPT2046 làm thiết bị trỏ của LVGL. Gọi sau drv_display_init, 1 lần.
 * Kích thước trong cấu hình XPT2046 phải bằng kích thước màn hình theo hướng đang dùng. out_indev có thể NULL.
 */
esp_err_t drv_display_add_touch(drv_xpt2046_handle_t touch, lv_indev_t **out_indev);

/** timeout_ms < 0: chờ mãi. Khoá đệ quy: gọi lồng trong cùng task được. false nếu chưa init hoặc hết giờ. */
bool drv_display_lock(int timeout_ms);
void drv_display_unlock(void);

#ifdef __cplusplus
}
#endif
