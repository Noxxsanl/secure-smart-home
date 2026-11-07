/*
 * Kênh điều khiển ESP-NOW Camera ↔ Gateway (API_DESIGN §11, IOT_NODE_NETWORK §4.2, §5.1).
 *
 * Camera gửi:  PING (khi chưa có giờ), HEARTBEAT (30 s), EVENT {event:"motion", ts}, CMD_ACK.
 * Camera nhận: TIME_SYNC {ts}, CMD {command_id, action}. Chỉ nhận từ MAC Gateway đã ghép nối.
 *
 * Camera nối Local AP nên ESP-NOW chạy trên kênh của Local AP (= kênh router của Gateway) — không cần dò
 * kênh như Node phòng khách. TODO: ghép nối PAIR_* (WiFi Provisioning §9.1) để cấp LMK + thông tin Local AP.
 */
#pragma once

#include <stdbool.h>
#include <stdint.h>
#include "cam_config.h"
#include "esp_err.h"

/** Gọi từ task ESP-NOW khi Gateway gửi lệnh (đã kiểm nguồn, command_id chỉ gồm [A-Za-z0-9_-]). */
typedef void (*cam_espnow_cmd_cb_t)(const char *command_id, const char *action);

/** Cần cam_wifi_start() trước. ESP_ERR_INVALID_STATE nếu chưa ghép nối (thiếu MAC / LMK). */
esp_err_t cam_espnow_start(const cam_config_t *cfg, cam_espnow_cmd_cb_t on_cmd);

bool cam_espnow_ready(void);

esp_err_t cam_espnow_send_event(const char *event, int64_t ts);
esp_err_t cam_espnow_send_cmd_ack(const char *command_id, bool ok);
