/*
 * node_ui — giao diện LVGL trên màn hình Node (TFT 3.5" ILI9488 + cảm ứng XPT2046), cùng tông màu với Gateway.
 *
 * Bố cục (ngang 480×320):
 *   ┌ Node phòng khách ─────────────────────── ● kết nối Gateway ┐
 *   │ [ Nhiệt độ        °C ]  [ Độ ẩm              % ]           │
 *   │ trạng thái cảm biến                                        │
 *   │ [ Đèn ] [ Quạt ] [ Rèm cửa ] [ Điều hòa ]   trạng thái 4 TB│
 *   └ thanh kiểm tra cảm ứng (toạ độ chạm) ──────────────────────┘
 * Dữ liệu đẩy vào qua node_ui_set_* như gw_ui của Gateway; ui không biết relay/IR. Chấm xanh theo ngón tay vẫn giữ
 * để kiểm hiệu chuẩn cảm ứng. Chạm ô Điều hòa mở bảng điều khiển + học mã IR (node_ui_set_ac_callbacks).
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

/* 4 thiết bị điều khiển — cùng khoá telemetry Gateway đọc ở trang Phòng khách (gw_ui.h): lamp, fan, curtain, ac. */
typedef enum {
    NODE_UI_DEV_LAMP = 0,   /* Đèn (relay) */
    NODE_UI_DEV_FAN,        /* Quạt (relay) */
    NODE_UI_DEV_CURTAIN,    /* Rèm cửa */
    NODE_UI_DEV_AC,         /* Điều hòa (IR) */
    NODE_UI_DEV_COUNT,
} node_ui_dev_t;

#define NODE_UI_STATE_UNKNOWN (-1)   /* chưa lắp / chưa biết: ô hiện "--" (mặc định khi dựng màn hình) */

/**
 * Trạng thái 1 thiết bị: NODE_UI_STATE_UNKNOWN, 0 = tắt/đóng, 1 = bật/mở; riêng rèm 2..100 = mở theo %.
 * Ô đang bật/mở có nền xanh. Gọi được từ task bất kỳ.
 */
void node_ui_set_device(node_ui_dev_t dev, int state);

/** Nhiệt độ đặt của điều hòa (°C), hiện dưới chữ "BẬT" và trên bảng Điều hòa; NAN = không hiện. Gọi từ task bất kỳ. */
void node_ui_set_ac_setpoint(float setpoint_c);

/*
 * Bảng Điều hòa: chạm ô Điều hòa để mở. Có Bật / Tắt, nút - / + nhiệt độ, và màn "Học mã" (16 ô: TẮT, 16..30°C;
 * chạm ô để học, giữ lâu ô đã học để phát thử). ui chỉ báo ý định qua callback; application phát/thu IR rồi đẩy kết
 * quả về bằng node_ui_set_device / node_ui_set_ac_setpoint / node_ui_set_ac_learned / node_ui_set_ac_message.
 *
 * Mã "slot": NODE_UI_AC_SLOT_OFF = mã TẮT; 16..30 = mã BẬT chế độ Lạnh ở nhiệt độ đó.
 */
#define NODE_UI_AC_SLOT_OFF 0
#define NODE_UI_AC_TEMP_MIN 16
#define NODE_UI_AC_TEMP_MAX 30

typedef struct {
    void (*on_power)(bool on, void *ctx);
    void (*on_set_temp)(int temp_c, void *ctx);   /* đã gộp các lần bấm - / + liên tiếp (600 ms) */
    void (*on_learn)(int slot, void *ctx);
    void (*on_test)(int slot, void *ctx);
    void *ctx;
} node_ui_ac_callbacks_t;

/** Callback chạy trong task LVGL (đang giữ khoá màn hình): chỉ được đẩy việc sang task khác, không chặn. */
void node_ui_set_ac_callbacks(const node_ui_ac_callbacks_t *cbs);

/** Mã đã học: bit 0 = TẮT, bit (t - 15) = t°C. Ô đã học có nền xanh. */
void node_ui_set_ac_learned(uint32_t mask);

typedef enum {
    NODE_UI_MSG_INFO = 0,
    NODE_UI_MSG_OK,
    NODE_UI_MSG_WARN,
    NODE_UI_MSG_BAD,
} node_ui_msg_t;

/** Dòng thông báo dưới bảng Điều hòa (hướng dẫn học mã, kết quả phát). Gọi được từ task bất kỳ. */
void node_ui_set_ac_message(node_ui_msg_t level, const char *text);

#ifdef __cplusplus
}
#endif
