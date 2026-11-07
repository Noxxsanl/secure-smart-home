/*
 * gw_ui — màn hình trạng thái của Gateway (bản sơ bộ của "Trang chủ" + "Thiết bị", IOT_NODE_NETWORK §3.3):
 *   thanh trên: WiFi, Server, giờ · thẻ Phòng khách: nhiệt độ/độ ẩm/ánh sáng · thẻ Camera: chuyển động, ảnh gần nhất
 *   · bảng thiết bị đã ghép (online, RSSI, lần cuối thấy) · dòng trạng thái.
 *
 * Gọi được từ MỌI task: gw_ui_set_* chỉ ghi vào mô hình (có mutex); lv_timer trong task LVGL vẽ lại mỗi 500 ms.
 * Gọi khi chưa gw_ui_start (màn hình lỗi) thì bỏ qua.
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

/** Cần gw_display_init trước. Tạo màn hình và timer vẽ lại. */
esp_err_t gw_ui_start(void);

/** Dòng trạng thái cuối màn hình (VD hướng dẫn khi thiếu cấu hình). */
void gw_ui_set_status(const char *text, bool is_error);

/** time_synced = false → đồng hồ hiện "--:--:--". */
void gw_ui_set_network(bool wifi, const char *ip, bool server, bool time_synced);

/** sensor_payload JSON {"sensor_id", ..., "data": {temperature, humidity, light, ...}}. */
void gw_ui_set_telemetry(const char *device_id, const char *payload, size_t len);

void gw_ui_set_motion(const char *device_id, int64_t ts);
void gw_ui_set_snapshot(const char *device_id, size_t bytes, int64_t ts, bool uploaded);

void gw_ui_set_devices(const gw_ui_device_t *list, size_t n);

#ifdef __cplusplus
}
#endif
