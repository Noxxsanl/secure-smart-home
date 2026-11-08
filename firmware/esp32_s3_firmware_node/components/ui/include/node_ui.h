/*
 * node_ui — giao diện LVGL trên màn hình Node (TFT 3.5" ILI9488 + cảm ứng XPT2046), cùng tông màu với Gateway.
 *
 * Hiện có màn hình KIỂM TRA để lắp mạch: chấm theo ngón tay + toạ độ (kiểm hiệu chuẩn cảm ứng), nút bấm thử có đếm.
 * Màn hình thật (nhiệt độ, độ ẩm, relay, kết nối Gateway — README, mục Khi chốt GPIO) thêm sau khi có application,
 * dữ liệu đẩy vào qua node_ui_set_* như gw_ui của Gateway.
 *
 * Chữ tiếng Việt có dấu (bất biến 10): font node_font_vi_16/24 trong ui/fonts/ (chép từ Gateway, gen_fonts.sh).
 * Chuỗi phải là UTF-8; ký tự ngoài bộ font hiện thành ô trống.
 */
#pragma once

#include "esp_err.h"

#ifdef __cplusplus
extern "C" {
#endif

/** Dựng màn hình kiểm tra. Gọi sau board_display_init (cần drv_display đã chạy). */
esp_err_t node_ui_start(void);

#ifdef __cplusplus
}
#endif
