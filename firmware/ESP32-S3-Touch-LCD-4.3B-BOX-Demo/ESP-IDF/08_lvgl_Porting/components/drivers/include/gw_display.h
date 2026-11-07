/*
 * gw_display — màn hình 4.3" 800x480 của Gateway: LCD RGB (ST7701) + LVGL 8, cảm ứng GT911 nếu bật.
 *
 * Bọc code ví dụ Waveshare 08_lvgl_Porting (src/lcd/, giữ nguyên) để tầng trên không phụ thuộc tên hàm/macro của
 * ví dụ. Độ phân giải, chế độ chống xé hình, xoay màn hình: menuconfig → "Example Configuration" và
 * ESP_PANEL_USE_1024_600_LCD / CONFIG_EXAMPLE_LCD_TOUCH_CONTROLLER_GT911 trong src/lcd/lvgl_port.h.
 *
 * LVGL KHÔNG an toàn đa luồng: mọi lời gọi lv_* ngoài callback của LVGL phải nằm giữa gw_display_lock/unlock.
 * Callback lv_timer chạy trong task LVGL, đã giữ khoá sẵn.
 */
#pragma once

#include <stdbool.h>
#include "esp_err.h"

#ifdef __cplusplus
extern "C" {
#endif

/** Khởi tạo LCD + LVGL (task LVGL ở nhân 1) và bus I2C chung. Gọi 1 lần, trước gw_rtc_init. */
esp_err_t gw_display_init(void);

/** timeout_ms < 0: chờ mãi. */
bool gw_display_lock(int timeout_ms);
void gw_display_unlock(void);

/** Đèn nền qua bộ mở rộng CH422G (I2C). */
esp_err_t gw_display_backlight(bool on);

#ifdef __cplusplus
}
#endif
