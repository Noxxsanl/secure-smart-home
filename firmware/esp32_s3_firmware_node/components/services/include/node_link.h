/*
 * node_link — kênh ESP-NOW Node ↔ Gateway (API_DESIGN §11, IOT_NODE_NETWORK §5.1, §6.1, §6.3).
 *
 * Node gửi:  PING (dò kênh / xin giờ), HEARTBEAT (30 s), TELEMETRY, EVENT, CMD_ACK.
 * Node nhận: TIME_SYNC {ts}, CMD {command_id, action, params?, ts?} — CHỈ từ MAC Gateway đã ghép nối.
 *
 * Dò kênh: thử kênh lưu trong NVS trước rồi 1..13, gửi PING tới khi Gateway ack ở tầng MAC; lưu kênh
 * tìm được. Mất ack CONFIG_NODE_LINK_MAX_FAILS lần liên tiếp → dò lại (router đổi kênh).
 *
 * Bảo mật:
 *   - Peer mã hoá bằng LMK riêng của node; từ chối chạy không mã hoá trừ khi bật [DEV] trong menuconfig.
 *   - Bỏ khung từ MAC lạ, khung sai định dạng / sai phiên bản, khung trùng `seq` (phát lại gần đây).
 *   - command_id chỉ gồm [A-Za-z0-9_-] ≤ 64, action chỉ gồm [a-z0-9_] ≤ 32.
 *   - Lệnh trùng command_id (Gateway gửi lại) KHÔNG thực thi lần 2 — gửi lại ack cũ.
 *   - Lệnh có `ts` phải nằm trong ±CONFIG_NODE_CMD_TS_WINDOW_S; bật CONFIG_NODE_CMD_REQUIRE_TS để bắt buộc.
 *
 * Yêu cầu trước: nvs_flash_init(). node_link tự bật WiFi ở chế độ STA KHÔNG kết nối (chỉ dùng radio),
 * tự tạo event loop mặc định nếu chưa có.
 */
#pragma once

#include <stdbool.h>
#include <stddef.h>
#include <stdint.h>

#include "cJSON.h"
#include "esp_err.h"
#include "node_config.h"

#ifdef __cplusplus
extern "C" {
#endif

typedef enum {
    NODE_POWER_UNKNOWN = -1,   /* không gửi trường power */
    NODE_POWER_OFF = 0,
    NODE_POWER_ON = 1,
} node_power_t;

/**
 * Gọi từ task của node_link. command_id/action/params chỉ hợp lệ trong lúc callback chạy — cần giữ thì chép.
 * Callback phải gọi node_link_send_cmd_ack() (ngay, hoặc từ task khác) trong < 3 s: Gateway chờ tối đa 3 s
 * rồi báo lỗi lên Server (IOT_NODE_NETWORK §6.3). Việc lâu thì đẩy sang task khác, đừng chặn ở đây.
 */
typedef void (*node_link_cmd_cb_t)(const char *command_id, const char *action, const cJSON *params, void *ctx);

/** Báo khi tìm thấy / mất Gateway. */
typedef void (*node_link_state_cb_t)(bool online, uint8_t channel, void *ctx);

typedef struct {
    node_link_cmd_cb_t on_cmd;
    node_link_state_cb_t on_state;
    void *ctx;
} node_link_callbacks_t;

/** ESP_ERR_INVALID_STATE nếu chưa ghép nối (thiếu MAC Gateway hoặc LMK) hoặc đã start. */
esp_err_t node_link_start(const node_config_t *cfg, const node_link_callbacks_t *cbs);

bool node_link_is_online(void);
uint8_t node_link_channel(void);

/** Gửi nguyên văn 1 sensor_payload (node_telemetry_build). ESP_FAIL nếu Gateway không ack tầng MAC. */
esp_err_t node_link_send_telemetry(const char *payload, size_t len);

/** {event, ts} — event chỉ gồm [a-z0-9_]. */
esp_err_t node_link_send_event(const char *event, int64_t ts);

esp_err_t node_link_send_cmd_ack(const char *command_id, bool ok, node_power_t power);

#ifdef __cplusplus
}
#endif
