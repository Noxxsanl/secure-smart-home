/*
 * gw_ui — màn hình trạng thái của Gateway (bản sơ bộ của "Trang chủ" + "Camera" + "Thiết bị", IOT_NODE_NETWORK §3.3):
 *   thanh trên: WiFi, Server, giờ · thẻ Phòng khách: nhiệt độ/độ ẩm/ánh sáng · thẻ Camera: chuyển động, ảnh chụp
 *   gần nhất (thu nhỏ), nút "Xem truc tiep" (khi bật cảm ứng) · bảng thiết bị đã ghép · dòng trạng thái.
 *   Màn hình xem trực tiếp (phủ toàn màn hình): khung 640x480 từ camera + cột trạng thái, nút "Dong".
 *
 * Gọi được từ MỌI task: gw_ui_set_* chỉ ghi vào mô hình (có mutex); lv_timer trong task LVGL vẽ lại mỗi 500 ms.
 * Riêng ảnh (gw_ui_live_frame, gw_ui_set_snapshot_image): giải nén JPEG ngay trong task gọi, rồi đổi ảnh dưới
 * khoá LVGL (2 bộ đệm — LVGL không bao giờ vẽ bộ đệm đang bị ghi). Gọi khi chưa gw_ui_start thì bỏ qua.
 *
 * Màn hình KHÔNG hiển thị secret, mật khẩu WiFi, token (bất biến 1, 2).
 *
 * Giới hạn: font Montserrat có sẵn của LVGL không có dấu tiếng Việt → chữ tạm viết không dấu. Cần sinh font
 * có dải U+00C0–U+1EF9 (lv_font_conv) rồi đổi sang có dấu (bất biến 10) — README, mục Việc còn lại.
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

typedef struct {
    char device_id[GW_UI_ID_MAX + 1];
    bool is_camera;
    bool online;
    int rssi;
    uint32_t seen_ago_s;   /* UINT32_MAX = chưa thấy */
} gw_ui_device_t;

typedef enum {
    GW_UI_LIVE_OFF = 0,     /* ẩn màn hình xem trực tiếp */
    GW_UI_LIVE_CONNECTING,
    GW_UI_LIVE_PLAYING,
    GW_UI_LIVE_RETRY,       /* mất kết nối, đang thử lại */
} gw_ui_live_state_t;

/** Người dùng chạm nút: open = true "Xem truc tiep", false "Dong". Chạy trong task LVGL — chỉ đẩy việc đi. */
typedef void (*gw_ui_live_cb_t)(bool open, void *ctx);

/** Cần gw_display_init trước. Tạo màn hình, timer vẽ lại và bộ đệm ảnh (PSRAM). */
esp_err_t gw_ui_start(void);

/** Dòng trạng thái cuối màn hình (VD hướng dẫn khi thiếu cấu hình). */
void gw_ui_set_status(const char *text, bool is_error);

/** time_synced = false → đồng hồ hiện "--:--:--". */
void gw_ui_set_network(bool wifi, const char *ip, bool server, bool time_synced);

/** sensor_payload JSON {"sensor_id", ..., "data": {temperature, humidity, light, ...}}. */
void gw_ui_set_telemetry(const char *device_id, const char *payload, size_t len);

void gw_ui_set_motion(const char *device_id, int64_t ts);
void gw_ui_set_snapshot(const char *device_id, size_t bytes, int64_t ts, bool uploaded);

/**
 * Hiện ảnh chụp gần nhất (thu nhỏ vừa 200x150) trong thẻ Camera. Giải nén trong task gọi (~0,1–0,3 s với SVGA).
 * Chỉ gọi từ 1 task.
 */
esp_err_t gw_ui_set_snapshot_image(const uint8_t *jpeg, size_t len);

void gw_ui_set_devices(const gw_ui_device_t *list, size_t n);

/** Đăng ký hàm nhận thao tác nút xem trực tiếp. Gọi 1 lần khi khởi động. */
void gw_ui_set_live_handler(gw_ui_live_cb_t cb, void *ctx);

/** Dòng gợi ý trong thẻ Camera khi không có cảm ứng (VD "tự mở khi có chuyển động"). */
void gw_ui_set_live_hint(const char *text);

/** Hiện/ẩn màn hình xem trực tiếp. close_in_s > 0 → hiện "tự đóng sau N s". */
void gw_ui_set_live(gw_ui_live_state_t state, const char *device_id, uint32_t close_in_s);

/**
 * 1 khung của luồng trực tiếp: giải nén vừa 640x480 (QVGA được phóng x2) rồi đổi ảnh. Chặn trong lúc giải nén
 * (~0,1–0,2 s với VGA). Bỏ qua (ESP_ERR_INVALID_STATE) khi màn hình xem trực tiếp đang tắt. Chỉ gọi từ 1 task.
 */
esp_err_t gw_ui_live_frame(const uint8_t *jpeg, size_t len);

#ifdef __cplusplus
}
#endif
