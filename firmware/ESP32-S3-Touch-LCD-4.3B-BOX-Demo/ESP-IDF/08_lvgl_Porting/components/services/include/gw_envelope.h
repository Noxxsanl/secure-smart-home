/*
 * gw_envelope — dựng payload Gateway → Server, có ts + HMAC bằng secret gateway (API_DESIGN §3, §8, §9).
 * Trả chuỗi JSON cấp phát động (giải phóng bằng free()), NULL nếu lỗi (chưa có giờ, thiếu bộ nhớ…).
 *
 *   Telemetry   {gateway_id, gw_timestamp, gw_hmac, gateway_ip?, sensor_payload}
 *               gw_hmac = HMAC(secret gw, "<gateway_id>:<gw_timestamp>"). CÙNG payload cho MQTT gateway/<id>/data
 *               và HTTP POST /api/device/data — backend kiểm hai đường bằng cùng logic (bất biến 4, 5).
 *   Ack lệnh    {command_id, status, power?, ts, hmac}, hmac = HMAC(secret gw, "<command_id>:<status>:<ts>")  — đã có
 *   Heartbeat   {ts, uptime, rssi, ip, fw_version, nodes[], hmac}, hmac = HMAC(secret gw, "<gateway_id>:<ts>")
 *               — ĐỀ XUẤT (API_DESIGN §9.2, chuỗi ký chưa chốt §14 Q2; backend chưa subscribe)
 *   Camera      {type, ts, snapshot_id?, hmac}, hmac = HMAC(secret gw, "<device_id>:<type>:<ts>")
 *               — ĐỀ XUẤT (API_DESIGN §9.2, §14 Q2; backend chưa subscribe)
 */
#pragma once

#include <stdbool.h>
#include <stddef.h>
#include <stdint.h>

#ifdef __cplusplus
extern "C" {
#endif

typedef struct {
    const char *device_id;
    int rssi;
    int64_t last_seen;        /* unix, 0 = chưa thấy */
    const char *fw_version;   /* "" = chưa biết */
    bool online;
} gw_envelope_node_t;

/** sensor_payload là JSON object đã qua lớp 1 (gw_espnow), chép nguyên vào trường sensor_payload. */
char *gw_envelope_telemetry(const char *sensor_payload, size_t len);

/** power: 0/1, hoặc < 0 để bỏ trường. */
char *gw_envelope_ack(const char *command_id, bool ok, int power);

char *gw_envelope_heartbeat(uint32_t uptime_s, const gw_envelope_node_t *nodes, size_t count);

/** snapshot_id = NULL khi không có ảnh (camera không gửi kịp / upload lỗi). */
char *gw_envelope_camera_event(const char *device_id, const char *type, int64_t event_ts, const char *snapshot_id);

#ifdef __cplusplus
}
#endif
