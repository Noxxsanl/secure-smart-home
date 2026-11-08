/*
 * gw_ui — giao diện màn hình Gateway 800x480 (IOT_NODE_NETWORK §3.3):
 *
 *   ┌ header: SMART HOME GATEWAY · WiFi · Server · giờ ──────────────────────────────┐
 *   │ [CAMERA     ] │ nội dung của mục đang chọn (hàng tiêu đề: tên · trạng thái kết nối): │
 *   │ [PHONG KHACH] │   Camera      hình trực tiếp 448x336                                 │
 *   │ [THIET BI   ] │   Phòng khách nhiệt độ, độ ẩm + trạng thái quạt, điều hoà, đèn, rèm   │
 *   │   (nav)       │   Thiết bị    bảng thiết bị đã ghép (online, RSSI, lần cuối thấy)    │
 *   └ footer: dòng trạng thái ───────────────────────────────────────────────────────┘
 *
 * Chạm mục trên nav (cần cảm ứng GT911) → đổi trang ngay và báo tầng trên qua gw_ui_page_cb_t (VD để bật/tắt luồng
 * camera). Tầng trên đổi trang bằng gw_ui_show_page (VD có chuyển động → trang Camera).
 *
 * Gọi được từ MỌI task: gw_ui_set_* chỉ ghi vào mô hình (có mutex); lv_timer trong task LVGL vẽ lại mỗi 500 ms.
 * Riêng khung hình (gw_ui_live_frame): giải nén JPEG ngay trong task gọi, rồi đổi ảnh dưới khoá LVGL (2 bộ đệm —
 * LVGL không bao giờ vẽ bộ đệm đang bị ghi). Gọi khi chưa gw_ui_start thì bỏ qua.
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
    GW_UI_PAGE_ROOM,      /* Phòng khách */
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

/** Cần gw_display_init trước. Tạo màn hình (trang Camera), timer vẽ lại và bộ đệm ảnh (PSRAM). */
esp_err_t gw_ui_start(void);

/** Đăng ký hàm nhận thao tác trên nav. Gọi 1 lần khi khởi động. */
void gw_ui_set_page_handler(gw_ui_page_cb_t cb, void *ctx);

/** Đổi trang từ task khác (không gọi lại gw_ui_page_cb_t). */
void gw_ui_show_page(gw_ui_page_t page);

/** Dòng trạng thái cuối màn hình (VD hướng dẫn khi thiếu cấu hình). */
void gw_ui_set_status(const char *text, bool is_error);

/** time_synced = false → đồng hồ hiện "--:--:--". */
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

void gw_ui_set_devices(const gw_ui_device_t *list, size_t n);

/** Trạng thái luồng trực tiếp ở trang Camera. */
void gw_ui_set_live(gw_ui_live_state_t state);

/**
 * 1 khung của luồng trực tiếp: giải nén vừa 448x336 rồi đổi ảnh. Chặn trong lúc giải nén (~0,2–0,3 s với VGA).
 * Bỏ qua (ESP_ERR_INVALID_STATE) khi luồng đang tắt. Chỉ gọi từ 1 task.
 */
esp_err_t gw_ui_live_frame(const uint8_t *jpeg, size_t len);

#ifdef __cplusplus
}
#endif
