/*
 * node_ui — giao diện LVGL trên màn hình Node (TFT 3.5" ILI9488 + cảm ứng XPT2046), cùng tông màu với Gateway.
 *
 * Hiện có: 2 ô nhiệt độ / độ ẩm (node_ui_set_climate) + phần KIỂM TRA để lắp mạch: chấm theo ngón tay + toạ độ
 * (kiểm hiệu chuẩn cảm ứng), nút bấm thử có đếm. Relay, kết nối Gateway (README, mục Khi chốt GPIO) thêm sau, dữ liệu
 * đẩy vào qua node_ui_set_* như gw_ui của Gateway.
 *
 * Chữ tiếng Việt có dấu (bất biến 10): font node_font_vi_16/24 trong ui/fonts/ (chép từ Gateway, gen_fonts.sh).
 * Chuỗi phải là UTF-8; ký tự ngoài bộ font hiện thành ô trống.
 */
#pragma once

#include <stdbool.h>
#include <stdint.h>

#include "esp_err.h"

#ifdef __cplusplus
extern "C" {
#endif

/** Dựng màn hình. Gọi sau board_display_init (cần drv_display đã chạy). */
esp_err_t node_ui_start(void);

/**
 * Nhiệt độ (°C) / độ ẩm (%RH) mới đọc. ok = false: ô hiện "--" và dòng hướng dẫn kiểm dây cảm biến.
 * Gọi được từ task bất kỳ (tự giữ khoá LVGL); không làm gì nếu màn hình chưa chạy.
 */
void node_ui_set_climate(bool ok, float temperature_c, float humidity_pct);

typedef enum {
    NODE_UI_LINK_UNPAIRED = 0,   /* NVS chưa có danh tính / MAC Gateway / LMK: ESP-NOW không chạy */
    NODE_UI_LINK_SEARCHING,      /* đang dò kênh tìm Gateway (hoặc vừa mất) */
    NODE_UI_LINK_ONLINE,         /* Gateway ack ở tầng MAC */
} node_ui_link_t;

/**
 * Góc phải hàng tiêu đề: chấm đỏ / vàng / xanh + chữ. last_sent_ts = giờ unix lần gửi số đo gần nhất được Gateway
 * nhận (0 = chưa gửi) — hiện giờ địa phương theo TZ do application đặt. Gọi được từ task bất kỳ.
 */
void node_ui_set_link(node_ui_link_t link, int64_t last_sent_ts);

#ifdef __cplusplus
}
#endif
