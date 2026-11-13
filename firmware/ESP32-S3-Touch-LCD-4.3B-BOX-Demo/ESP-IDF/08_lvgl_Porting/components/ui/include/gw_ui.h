/*
 * gw_ui — giao diện màn hình Gateway 800x480 (IOT_NODE_NETWORK §3.3):
 *
 *   ┌ header: Gateway Smart Home ·························· Th 7 14/11/2026  21:05:33 ┐
 *   │ [CAMERA     ] │ nội dung của mục đang chọn (hàng tiêu đề: tên · trạng thái kết nối): │
 *   │ [LIVING ROOM] │   Camera      hình trực tiếp 448x336                                 │
 *   │ [THIET BI   ] │   Living room nhiệt độ, độ ẩm + công tắc quạt, điều hoà, đèn, rèm    │
 *   │   (nav)       │   Thiết bị    bảng thiết bị đã ghép (online, RSSI, lần cuối thấy)    │
 *   └ footer: dòng trạng thái ················ WiFi <ip> · Máy chủ OK ┘
 *
 * Chạm mục trên nav (cần cảm ứng GT911) → đổi trang ngay và báo tầng trên qua gw_ui_page_cb_t (VD để bật/tắt luồng
 * camera). Tầng trên đổi trang bằng gw_ui_show_page (VD có chuyển động → trang Camera).
 *
 * Trang Living room có công tắc cho quạt / điều hoà / đèn / rèm và 2 nút mức rèm (50 / 100 %). Chạm → gw_ui_control_cb_t
 * (điều khiển cục bộ Gateway → Node, không qua Server); Node ack ok → tầng trên gọi gw_ui_set_actuator để màn hình đổi
 * ngay; lệnh thất bại thì tầng trên gọi gw_ui_control_failed để công tắc trở về trạng thái thật của Node.
 *
 * Gọi được từ MỌI task: gw_ui_set_* chỉ ghi vào mô hình (có mutex); lv_timer trong task LVGL vẽ lại mỗi 200 ms.
 * Riêng khung hình (gw_ui_live_submit): chỉ trao con trỏ JPEG cho task giải nén riêng (nhân 1, ưu tiên dưới LVGL),
 * task đó luôn lấy khung MỚI NHẤT (khung cũ chưa kịp giải nén bị bỏ) rồi đổi ảnh dưới khoá LVGL (2 bộ đệm — LVGL
 * không bao giờ vẽ bộ đệm đang bị ghi). Gọi khi chưa gw_ui_start thì bỏ qua.
 *
 * Màn hình KHÔNG hiển thị secret, mật khẩu WiFi, token (bất biến 1, 2).
 *
 * Chữ tiếng Việt có dấu (bất biến 10): font riêng gw_font_vi_16/20/24 trong ui/fonts/ (Montserrat + biểu tượng LVGL,
 * sinh bằng fonts/gen_fonts.sh). Chuỗi đưa vào gw_ui_set_status phải là UTF-8; ký tự ngoài bộ font hiện thành ô trống.
 */
#pragma once

#include <stdbool.h>
#include <stddef.h>
#include <stdint.h>

#include "esp_err.h"

#ifdef __cplusplus
extern "C" {
#endif

#define GW_UI_MAX_DEVICES 8
#define GW_UI_ID_MAX 64

/** Kết nối thiết bị ↔ Gateway (chấm đỏ / vàng / xanh ở bảng Thiết bị) — quy tắc tính ở gw_app (refresh_devices_ui). */
typedef enum {
    GW_UI_LINK_NONE = 0,     /* chưa kết nối / đã mất kết nối */
    GW_UI_LINK_CONNECTING,   /* đang kết nối: mới vào được một phần, hoặc Gateway vừa khởi động đang chờ */
    GW_UI_LINK_OK,           /* đã kết nối */
} gw_ui_link_t;

typedef struct {
    char device_id[GW_UI_ID_MAX + 1];
    bool is_camera;
    gw_ui_link_t link;
    bool has_rssi;          /* đã nhận gói từ lúc Gateway khởi động */
    int rssi;               /* dBm của gói ESP-NOW gần nhất */
    int64_t last_seen_ts;   /* giờ unix lần cuối nhận gói hợp lệ, nhớ qua khởi động lại; 0 = chưa từng */
} gw_ui_device_t;

typedef enum {
    GW_UI_PAGE_CAMERA = 0,
    GW_UI_PAGE_ROOM,      /* LIVING ROOM (phòng khách) */
    GW_UI_PAGE_DEVICES,   /* Danh sách thiết bị */
} gw_ui_page_t;

#define GW_UI_PAGE_COUNT 3

typedef enum {
    GW_UI_LIVE_OFF = 0,     /* không kéo luồng (đang ở trang khác) */
    GW_UI_LIVE_WAITING,     /* chờ camera vào Local AP / chờ tới lượt thử lại */
    GW_UI_LIVE_CONNECTING,
    GW_UI_LIVE_PLAYING,
    GW_UI_LIVE_RETRY,       /* mất kết nối, đang thử lại */
} gw_ui_live_state_t;

/** Người dùng vừa chạm 1 mục trên nav (màn hình đã đổi trang). Chạy trong task LVGL — chỉ đẩy việc đi. */
typedef void (*gw_ui_page_cb_t)(gw_ui_page_t page, void *ctx);

/**
 * Người dùng vừa gạt công tắc / chạm nút mức rèm ở trang Living room. target: "fan" | "ac" | "lamp" | "curtain";
 * action: "turn_on" | "turn_off" (cả 4 thiết bị) hoặc "set_pos_50" | "set_pos_100" (rèm).
 * Chạy trong task LVGL (đang giữ khoá LVGL) — chỉ đẩy việc đi, không chặn.
 */
typedef void (*gw_ui_control_cb_t)(const char *target, const char *action, void *ctx);

/** Cần gw_display_init trước. Tạo màn hình (trang Camera), timer vẽ lại và bộ đệm ảnh (PSRAM). */
esp_err_t gw_ui_start(void);

/** Đăng ký hàm nhận thao tác trên nav. Gọi 1 lần khi khởi động. */
void gw_ui_set_page_handler(gw_ui_page_cb_t cb, void *ctx);

/** Đăng ký hàm nhận thao tác điều khiển ở trang Living room. Gọi 1 lần khi khởi động. */
void gw_ui_set_control_handler(gw_ui_control_cb_t cb, void *ctx);

/** Đổi trang từ task khác (không gọi lại gw_ui_page_cb_t). */
void gw_ui_show_page(gw_ui_page_t page);

/** Dòng trạng thái cuối màn hình (VD hướng dẫn khi thiếu cấu hình). */
void gw_ui_set_status(const char *text, bool is_error);

/**
 * Lệnh điều khiển cục bộ thất bại: hiện text (màu lỗi) ở dòng trạng thái và vẽ lại ngay để các công tắc trở về trạng
 * thái Node đã báo lần cuối.
 */
void gw_ui_control_failed(const char *text);

/** time_synced = false → đồng hồ ở header hiện "--/--/----  --:--:--"; có giờ: "Th 7 14/11/2026  21:05:33". */
void gw_ui_set_network(bool wifi, const char *ip, bool server, bool time_synced);

/**
 * sensor_payload JSON {"sensor_id", "sn_timestamp", ..., "data": {...}} của node phòng khách. Chỉ cập nhật trường có
 * mặt (node gửi số đo và trạng thái chung 1 gói hoặc tách gói đều được):
 *   temperature, humidity, light (lux)          số đo
 *   fan, ac, lamp                               0 = tắt, 1 = bật (số hoặc true/false)
 *   ac_temp                                     nhiệt độ đặt của điều hoà (°C)
 *   curtain                                     0 = đóng, 1 = mở, 2..100 = mở theo %
 * Tên trường trạng thái là ĐỀ XUẤT — chốt cùng firmware node (esp32_s3_firmware_node/README.md).
 */
void gw_ui_set_telemetry(const char *device_id, const char *payload, size_t len);

/**
 * Cập nhật NGAY trạng thái 1 thiết bị của node phòng khách từ CMD_ACK (không chờ telemetry kế tiếp), cùng cách mã hoá
 * với telemetry. target: "fan" | "ac" | "lamp" (state 0/1) | "curtain" (0 = đóng, 1..100 = mở theo %). Target lạ → bỏ
 * qua. Xoá mốc giữ công tắc của thiết bị đó nên công tắc và nền ô đổi ở lần vẽ lại kế tiếp (<= 200 ms).
 */
void gw_ui_set_actuator(const char *target, int state);

void gw_ui_set_devices(const gw_ui_device_t *list, size_t n);

/** Trạng thái luồng trực tiếp ở trang Camera. OFF = LCD không xem (khung gửi tới bị từ chối, không giải nén). */
void gw_ui_set_live(gw_ui_live_state_t state);

/** Hiện / ẩn nhãn "Đang được xem từ xa" trên trang Camera (có phiên relay lên Server). */
void gw_ui_set_remote_view(bool active);

/** Gọi khi giải nén xong, bị thay bằng khung mới hơn, hoặc bị bỏ: trả lại bộ đệm cho người gửi. Chạy trong task bất kỳ. */
typedef void (*gw_ui_frame_release_t)(void *arg);

/**
 * Trao 1 khung JPEG của luồng trực tiếp để giải nén vừa ô 448x336 (giữ tỉ lệ) và hiển thị. KHÔNG chặn, KHÔNG chép dữ liệu:
 * jpeg phải còn nguyên tới khi release(arg) được gọi. Chỉ giữ 1 khung chờ — khung mới hơn thay khung cũ (release khung cũ).
 *
 * Trả ESP_OK → ui đã nhận khung và sẽ gọi release; lỗi (ESP_ERR_INVALID_STATE khi luồng đang tắt hoặc ui chưa chạy) →
 * người gọi vẫn giữ khung và tự trả.
 */
esp_err_t gw_ui_live_submit(const uint8_t *jpeg, size_t len, gw_ui_frame_release_t release, void *arg);

#ifdef __cplusplus
}
#endif
