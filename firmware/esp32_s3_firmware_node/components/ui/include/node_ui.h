/*
 * node_ui — giao diện LVGL trên màn hình Node (TFT 3.5" ILI9488 + cảm ứng XPT2046), cùng tông màu với Gateway.
 *
 * Bố cục (ngang 480×320):
 *   ┌ Living Room                       Th 7, 14/11/2026  21:05  ● ┐   tiêu đề, ngày giờ, chấm kết nối Gateway
 *   │ [ Nhiệt độ            °C ]   [ Độ ẩm                   % ]    │
 *   │ [ Đèn          (switch) ]   [ Quạt             (switch) ]    │   lưới 2×2, mỗi ô 1 công tắc gạt
 *   │ [ Rèm cửa      (switch) ]   [ Điều hòa         (switch) ]    │   ô rèm: 2 nút mức 50% / 100%
 *   └ (wifi)  dòng thông báo ───────────────────────────────────────┘
 * Dữ liệu đẩy vào qua node_ui_set_* như gw_ui của Gateway; ui không biết relay/IR/động cơ — chỉ báo ý định qua callback,
 * application làm rồi đẩy trạng thái thật về (công tắc luôn quay về trạng thái đã xác nhận).
 *   - Đèn / Quạt: gạt công tắc hoặc chạm ô = bật/tắt (node_ui_set_switch_callbacks).
 *   - Rèm: công tắc = mở lại mức vừa dùng / đóng hẳn, 3 nút mức; chạm ô mở bảng Rèm (DỪNG + hiệu chuẩn)
 *     (node_ui_set_curtain_callbacks).
 *   - Điều hòa: công tắc = bật/tắt; chạm ô mở bảng Điều hòa (nhiệt độ, học mã IR) (node_ui_set_ac_callbacks).
 * Ngày giờ lấy từ đồng hồ hệ thống (application đặt TZ; giờ do Gateway cấp) — chưa có giờ thì hiện "--/--/----".
 *
 * Chữ tiếng Việt có dấu (bất biến 10; riêng tiêu đề "Living Room" theo yêu cầu): font node_font_vi_16/24 trong ui/fonts/.
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
 * Nhiệt độ (°C) / độ ẩm (%RH) mới đọc. ok = false: ô hiện "--" và dòng thông báo báo lỗi cảm biến cho tới khi đọc lại
 * được. Gọi được từ task bất kỳ (tự giữ khoá LVGL); không làm gì nếu màn hình chưa chạy.
 */
void node_ui_set_climate(bool ok, float temperature_c, float humidity_pct);

typedef enum {
    NODE_UI_LINK_UNPAIRED = 0,   /* NVS chưa có danh tính / MAC Gateway / LMK: ESP-NOW không chạy — đỏ */
    NODE_UI_LINK_SEARCHING,      /* đang dò kênh tìm Gateway (hoặc vừa mất) — vàng */
    NODE_UI_LINK_ONLINE,         /* Gateway ack ở tầng MAC — xanh */
} node_ui_link_t;

/** Chấm ở góc phải tiêu đề + biểu tượng sóng ở dòng dưới cùng: đỏ / vàng / xanh. Gọi được từ task bất kỳ. */
void node_ui_set_link(node_ui_link_t link);

typedef enum {
    NODE_UI_MSG_INFO = 0,
    NODE_UI_MSG_OK,
    NODE_UI_MSG_WARN,
    NODE_UI_MSG_BAD,
} node_ui_msg_t;

/**
 * Dòng thông báo dưới cùng: hiện `text` khoảng 5 giây rồi về "Sẵn sàng" (hoặc lỗi cảm biến nếu đang có).
 * Dùng cho việc vừa xảy ra: lệnh từ xa, thao tác bị từ chối... Gọi được từ task bất kỳ.
 */
void node_ui_set_notice(node_ui_msg_t level, const char *text);

/* 4 thiết bị điều khiển — cùng khoá telemetry Gateway đọc ở trang Living Room (gw_ui.h): lamp, fan, curtain, ac. */
typedef enum {
    NODE_UI_DEV_LAMP = 0,   /* Đèn (relay) */
    NODE_UI_DEV_FAN,        /* Quạt (relay) */
    NODE_UI_DEV_CURTAIN,    /* Rèm cửa — trạng thái đẩy bằng node_ui_set_curtain */
    NODE_UI_DEV_AC,         /* Điều hòa (IR) */
    NODE_UI_DEV_COUNT,
} node_ui_dev_t;

#define NODE_UI_STATE_UNKNOWN (-1)   /* chưa lắp / chưa biết: công tắc mờ, dòng phụ "Chưa lắp" (mặc định lúc dựng) */

/**
 * Trạng thái đã xác nhận của Đèn / Quạt / Điều hòa: NODE_UI_STATE_UNKNOWN, 0 = tắt, 1 = bật. Công tắc về đúng trạng
 * thái này (kể cả khi người dùng vừa gạt mà thao tác bị từ chối). Gọi được từ task bất kỳ.
 */
void node_ui_set_device(node_ui_dev_t dev, int state);

/*
 * Đèn / Quạt: gạt công tắc hoặc chạm ô. ui báo trạng thái MUỐN ĐẶT; application đóng/cắt relay rồi gọi
 * node_ui_set_device với trạng thái thật. Chưa đặt callback (relay tắt trong menuconfig) thì ô không phản ứng.
 */
typedef struct {
    void (*on_set)(node_ui_dev_t dev, bool on, void *ctx);   /* NODE_UI_DEV_LAMP hoặc NODE_UI_DEV_FAN */
    void *ctx;
} node_ui_switch_callbacks_t;

/** Callback chạy trong task LVGL (đang giữ khoá màn hình): chỉ được đẩy việc sang task khác, không chặn. */
void node_ui_set_switch_callbacks(const node_ui_switch_callbacks_t *cbs);

/*
 * Rèm cửa. Trên ô: công tắc (bật = mở lại mức vừa dùng, tắt = đóng hẳn) và 2 nút mức 50% / 100%. Chạm phần còn
 * lại của ô mở bảng Rèm: nút DỪNG và hiệu chuẩn (rèm không có công tắc hành trình) — giữ "Nhích ĐÓNG" / "Nhích MỞ" để
 * chạy từng chút bỏ qua giới hạn, "Đặt là ĐÓNG hẳn" / "Đặt là MỞ hẳn" để ghi mốc.
 */
typedef enum {
    NODE_UI_CURTAIN_OPEN = 0,      /* gạt công tắc sang bật: mở lại mức vừa dùng (application nhớ, mặc định 100 %) */
    NODE_UI_CURTAIN_CLOSE,         /* gạt công tắc sang tắt: đóng hẳn */
    NODE_UI_CURTAIN_STOP,
    NODE_UI_CURTAIN_SET_PERCENT,   /* value = 50 / 100 (nút mức) */
    NODE_UI_CURTAIN_JOG_OPEN,      /* đang giữ "Nhích MỞ": gửi khi chạm rồi lặp ~100 ms/lần khi giữ lâu */
    NODE_UI_CURTAIN_JOG_CLOSE,     /* đang giữ "Nhích ĐÓNG" */
    NODE_UI_CURTAIN_JOG_RELEASE,   /* thả nút nhích */
    NODE_UI_CURTAIN_MARK_CLOSED,   /* vị trí hiện tại = ĐÓNG hẳn */
    NODE_UI_CURTAIN_MARK_OPEN,     /* vị trí hiện tại = MỞ hẳn (ghi hành trình) */
} node_ui_curtain_op_t;

typedef struct {
    void (*on_op)(node_ui_curtain_op_t op, int value, void *ctx);
    void *ctx;
} node_ui_curtain_callbacks_t;

/** Callback chạy trong task LVGL (đang giữ khoá màn hình): chỉ được đẩy việc sang task khác, không chặn. */
void node_ui_set_curtain_callbacks(const node_ui_curtain_callbacks_t *cbs);

/**
 * Trạng thái rèm cho ô Rèm cửa + bảng Rèm: percent 0..100 = vị trí hiện tại (-1 = chưa biết); moving = đang chạy, khi
 * đó target_percent là đích (công tắc và nút mức theo ĐÍCH lúc đang chạy, theo vị trí lúc đứng yên); position / travel
 * (nửa bước) và calibrated hiện ở bảng Rèm. Gọi được từ task bất kỳ.
 */
void node_ui_set_curtain(int percent, int target_percent, bool moving, int32_t position, int32_t travel, bool calibrated);

/** Dòng thông báo dưới bảng Rèm (hướng dẫn / kết quả hiệu chuẩn). Gọi được từ task bất kỳ. */
void node_ui_set_curtain_message(node_ui_msg_t level, const char *text);

/** Nhiệt độ đặt của điều hòa (°C), hiện ở ô Điều hòa khi đang bật và trên bảng Điều hòa; NAN = không hiện. */
void node_ui_set_ac_setpoint(float setpoint_c);

/*
 * Bảng Điều hòa: chạm ô Điều hòa để mở. Màn điều khiển: công tắc nguồn, nhiệt độ đặt (nút - / +, thanh kéo 16..30),
 * nhiệt độ + độ ẩm phòng. Màn "Học mã": 16 ô (TẮT, 16..30°C) — chạm ô để học, giữ lâu ô đã học để phát thử; khi đang
 * chờ remote có thanh đếm ngược. Mức nhiệt chưa học mã: số chuyển vàng, không gửi lệnh.
 * ui chỉ báo ý định qua callback; application phát/thu IR rồi đẩy kết quả về bằng node_ui_set_device /
 * node_ui_set_ac_setpoint / node_ui_set_ac_learned / node_ui_set_ac_learning / node_ui_set_ac_message.
 *
 * Mã "slot": NODE_UI_AC_SLOT_OFF = mã TẮT; 16..30 = mã BẬT chế độ Lạnh ở nhiệt độ đó.
 */
#define NODE_UI_AC_SLOT_OFF 0
#define NODE_UI_AC_TEMP_MIN 16
#define NODE_UI_AC_TEMP_MAX 30

typedef struct {
    void (*on_power)(bool on, void *ctx);         /* công tắc trên ô Điều hòa và trên bảng */
    void (*on_set_temp)(int temp_c, void *ctx);   /* đã gộp các lần bấm - / + / kéo thanh liên tiếp (600 ms) */
    void (*on_learn)(int slot, void *ctx);
    void (*on_test)(int slot, void *ctx);
    void *ctx;
} node_ui_ac_callbacks_t;

/** Callback chạy trong task LVGL (đang giữ khoá màn hình): chỉ được đẩy việc sang task khác, không chặn. */
void node_ui_set_ac_callbacks(const node_ui_ac_callbacks_t *cbs);

/** Mã đã học: bit 0 = TẮT, bit (t - 15) = t°C. Ô đã học có dấu tích, nền xanh. */
void node_ui_set_ac_learned(uint32_t mask);

/**
 * Đang chờ người dùng bấm remote cho ô `slot` trong `timeout_ms`: ô nháy viền, hiện thanh đếm ngược.
 * timeout_ms = 0 (slot bất kỳ): hết chờ (đã thu / hết giờ / lỗi). Gọi được từ task bất kỳ.
 */
void node_ui_set_ac_learning(int slot, uint32_t timeout_ms);

/** Dòng thông báo dưới bảng Điều hòa (hướng dẫn học mã, kết quả phát). Gọi được từ task bất kỳ. */
void node_ui_set_ac_message(node_ui_msg_t level, const char *text);

#ifdef __cplusplus
}
#endif
