/*
 * gw_app — luồng nghiệp vụ Gateway (IOT_NODE_NETWORK §6):
 *
 *   6.1 Telemetry   Node ─ESP-NOW TELEMETRY→ [lớp 1: gw_espnow] → ký lớp 2 → MQTT gateway/<gw>/data
 *                   (MQTT mất → POST /api/device/data) · cập nhật màn hình
 *   6.2 Chuyển động Camera ─EVENT motion→ chờ ảnh ─POST /local/camera/snapshot→ [HMAC camera: gw_local_http]
 *                   → POST /api/device/camera/snapshot (đề xuất) → MQTT camera/event {motion, snapshot_id?} (đề xuất)
 *   6.3 Lệnh        MQTT .../device/<dev>/command [HMAC gateway + ts: gw_mqtt] → ESP-NOW CMD → CMD_ACK
 *                   → MQTT .../command/ack; node im lặng CONFIG_GW_NODE_ACK_TIMEOUT_MS → ack error
 *   Heartbeat       MQTT home/<h>/gateway/<gw>/heartbeat mỗi CONFIG_GW_HEARTBEAT_INTERVAL_S (đề xuất)
 *
 * Hai task: gw_app (xử lý sự kiện, không chặn lâu) và gw_uplink (HTTPS, chặn tới vài giây).
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
