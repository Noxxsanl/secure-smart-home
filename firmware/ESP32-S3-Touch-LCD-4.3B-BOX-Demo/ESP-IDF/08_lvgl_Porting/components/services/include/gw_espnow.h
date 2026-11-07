/*
 * gw_espnow — kênh ESP-NOW Gateway ↔ Node/Camera (API_DESIGN §11, IOT_NODE_NETWORK §5.1, §6).
 * Khung tin: ../common/espnow_proto (dùng chung với esp32_s3_firmware_node và esp32_cam).
 *
 * Gateway nhận: PING → trả TIME_SYNC · HEARTBEAT → cập nhật trạng thái, trả TIME_SYNC · TELEMETRY · EVENT · CMD_ACK
 * Gateway gửi:  TIME_SYNC {ts} · CMD {command_id, action, ts}
 *
 * Xác thực từng gói, theo thứ tự:
 *   1. MAC nguồn phải có trong gw_registry (đã ghép nối); peer mã hoá bằng LMK riêng của thiết bị.
 *   2. Khung đúng phiên bản, ≤ 250 byte, body là JSON object; bỏ gói trùng `seq` (8 gói gần nhất mỗi thiết bị).
 *   3. TELEMETRY (chỉ từ node): sensor_id PHẢI trùng device_id gắn với MAC đó (node A không gửi thay node B),
 *      sn_hmac = HMAC-SHA256(secret node, "<sensor_id>:<sn_timestamp>") khớp, lệch giờ ≤ ±300 s, sn_timestamp
 *      không lùi so với gói trước — giống hệt lớp 1 ở backend (bất biến 5).
 *   4. CMD_ACK: command_id/status đúng định dạng; khớp lệnh đang chờ là việc của tầng application.
 *
 * Callback chạy trong task gw_espnow — phải nhanh (đẩy sang task khác, không chặn). Chuỗi chỉ hợp lệ trong lúc gọi.
 */
#pragma once

#include <stdbool.h>
#include <stddef.h>
#include <stdint.h>

#include "esp_err.h"

#ifdef __cplusplus
extern "C" {
#endif

#define GW_ESPNOW_POWER_NONE (-1)

typedef struct {
    /** sensor_payload đã qua lớp 1, nguyên văn từ node (không NUL ở cuối, dùng len). */
    void (*on_telemetry)(size_t idx, const char *payload, size_t len, void *ctx);
    /** {event, ts} — VD camera "motion". */
    void (*on_event)(size_t idx, const char *event, int64_t ts, void *ctx);
    /** power: 0/1, hoặc GW_ESPNOW_POWER_NONE nếu node không gửi. */
    void (*on_cmd_ack)(size_t idx, const char *command_id, bool ok, int power, void *ctx);
    void *ctx;
} gw_espnow_callbacks_t;

/** Cần gw_wifi_start và gw_registry_load trước. */
esp_err_t gw_espnow_start(const gw_espnow_callbacks_t *cbs);

/** CMD {command_id, action, ts} tới thiết bị idx. ESP_FAIL nếu thiết bị không ack ở tầng MAC (mất kết nối). */
esp_err_t gw_espnow_send_cmd(size_t idx, const char *command_id, const char *action, int64_t ts);

/** TIME_SYNC {ts}; ESP_ERR_INVALID_STATE nếu chính Gateway chưa có giờ. */
esp_err_t gw_espnow_send_time_sync(size_t idx);

#ifdef __cplusplus
}
#endif
