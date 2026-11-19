/*
 * gw_app — luồng nghiệp vụ Gateway (IOT_NODE_NETWORK §6):
 *
 *   6.1 Telemetry   Node ─ESP-NOW TELEMETRY→ [lớp 1: gw_espnow] → ký lớp 2 → MQTT gateway/<gw>/data
 *                   (MQTT mất → POST /api/device/data) · cập nhật màn hình
 *   6.2 Chuyển động Camera ─EVENT motion→ chờ ảnh ─POST /local/camera/snapshot→ [HMAC camera: gw_local_http]
 *                   → hiện ảnh thu nhỏ lên màn hình → POST /api/device/camera/snapshot (đề xuất)
 *                   → MQTT camera/event {motion, snapshot_id?} (đề xuất)
 *   5.4 Trực tiếp   chạm "Camera" / chuyển động / camera vừa vào Local AP → gw_camera_live kéo
 *                   GET /stream (ký HMAC camera) → khung mới nhất được giải nén ở task riêng (gw_ui) → màn hình
 *   5.5 Xem từ xa   MQTT .../device/<cam>/command live_start / live_stop (command_id = session_id, không ack) →
 *                   gw_camera_relay đẩy khung JPEG nguyên vẹn lên Server qua WebSocket TLS; cùng 1 luồng camera với
 *                   màn hình (kéo khi LCD xem HOẶC có phiên), chỉ giải nén khi LCD xem; LCD hiện "Đang được xem từ xa"
 *   6.3 Lệnh        MQTT .../device/<dev>/command [HMAC gateway + ts: gw_mqtt] → ESP-NOW CMD → CMD_ACK
 *                   → MQTT .../command/ack; node im lặng CONFIG_GW_NODE_ACK_TIMEOUT_MS → ack error
 *   Heartbeat       MQTT home/<h>/gateway/<gw>/heartbeat mỗi CONFIG_GW_HEARTBEAT_INTERVAL_S (đề xuất)
 *
 * Task: gw_app (xử lý sự kiện, không chặn lâu), gw_uplink (HTTPS, chặn tới vài giây), gw_live (gw_camera_live: CHỈ
 * đọc luồng camera, nhân 0), gw_decode (gw_ui: giải nén khung mới nhất, nhân 1, ưu tiên dưới LVGL), gw_relay
 * (gw_camera_relay: gửi khung lên Server, nhân 0).
 */
#pragma once

#include "esp_err.h"

#ifdef __cplusplus
extern "C" {
#endif

/** Khởi tạo toàn bộ Gateway. Lỗi cấu hình được log và hiện lên màn hình; không reset liên tục. */
esp_err_t gw_app_start(void);

#ifdef __cplusplus
}
#endif
