/*
 * gw_mqtt — Gateway ↔ Server qua Broker MQTT (MQTT TLS 8883, CA nhúng — API_DESIGN §9, IOT_NODE_NETWORK §5.3).
 * Gateway là client MQTT duy nhất phía nhà; client_id = gateway_id.
 *
 * Publish (Gateway → Server):
 *   gateway/<gw>/data                                     telemetry (gw_envelope_telemetry)        QoS 1 — đã có
 *   home/<h>/gateway/<gw>/device/<dev>/command/ack        ack lệnh (gw_envelope_ack)               QoS 1 — đã có
 *   home/<h>/gateway/<gw>/heartbeat                       heartbeat (gw_envelope_heartbeat)        QoS 0 — đề xuất
 *   home/<h>/gateway/<gw>/device/<dev>/camera/event       sự kiện camera                           QoS 1 — đề xuất
 *
 * Subscribe (Server → Gateway), home_id dùng wildcard `+` vì Gateway chưa chắc biết home_id của mình:
 *   home/+/gateway/<gw>/device/+/command   {command_id, action, ts, hmac}
 *                                          hmac = HMAC(secret gw, "<command_id>:<device_id>:<action>:<ts>")
 *   home/+/gateway/<gw>/command            {command_id, action, ts, hmac}  (restart, factory_reset)
 *                                          hmac = HMAC(secret gw, "<command_id>:<gateway_id>:<action>:<ts>")
 *   home/+/gateway/<gw>/ota/command        {job_id, version, ..., ts, hmac}, hmac = "<job_id>:<version>:<ts>"
 *
 * Lệnh chỉ tới callback khi: topic đúng gateway_id của mình, home_id là số, trường đúng định dạng, Gateway đã có giờ
 * và |now − ts| ≤ 300 s, HMAC khớp, command_id chưa gặp gần đây (chống phát lại trong cửa sổ). Lệnh sai bị bỏ im
 * lặng (log cảnh báo, không log hmac) — giống backend bỏ ack sai.
 *
 * Callback chạy trong task MQTT — phải nhanh, không chặn.
 */
#pragma once

#include <stdbool.h>
#include <stdint.h>

#include "esp_err.h"

#ifdef __cplusplus
extern "C" {
#endif

typedef struct {
    void (*on_device_cmd)(const char *home_id, const char *device_id, const char *command_id, const char *action,
                          int64_t ts, void *ctx);
    void (*on_gateway_cmd)(const char *home_id, const char *command_id, const char *action, void *ctx);
    void (*on_ota_cmd)(const char *home_id, const char *job_id, const char *version, void *ctx);
    void (*on_connection)(bool connected, void *ctx);
    void *ctx;
} gw_mqtt_callbacks_t;

/** Cần gw_config_load + gw_wifi_start. Từ chối mqtts:// khi chưa nhúng CA, mqtt:// khi chưa bật [DEV]. */
esp_err_t gw_mqtt_start(const char *uri, const gw_mqtt_callbacks_t *cbs);

bool gw_mqtt_connected(void);

/** ESP_ERR_INVALID_STATE khi chưa kết nối (bên gọi chuyển sang HTTP dự phòng hoặc bỏ). */
esp_err_t gw_mqtt_publish_telemetry(const char *json);
esp_err_t gw_mqtt_publish_ack(const char *home_id, const char *device_id, const char *json);
esp_err_t gw_mqtt_publish_heartbeat(const char *home_id, const char *json);
esp_err_t gw_mqtt_publish_camera_event(const char *home_id, const char *device_id, const char *json);

#ifdef __cplusplus
}
#endif
