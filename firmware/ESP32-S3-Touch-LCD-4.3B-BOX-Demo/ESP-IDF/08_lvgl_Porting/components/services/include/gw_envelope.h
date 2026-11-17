/*
 * gw_envelope — dựng payload Gateway → Server, có ts + HMAC bằng secret gateway (API_DESIGN §3, §8, §9).
 * Trả chuỗi JSON cấp phát động (giải phóng bằng free()), NULL nếu lỗi (chưa có giờ, thiếu bộ nhớ…).
 *
 *   Telemetry   v2: {v:2, gateway_id, gw_timestamp, gw_hmac, gateway_ip?,
 *                    sensor_payload:{sensor_id, sn_timestamp, sn_ctr, sn_hmac, data_raw:"<JSON nguyên văn Node đã ký>"}}
 *               gw_hmac = HMAC(secret gw, "v2|gw|<gateway_id>|<gw_timestamp>|<gateway_ip>|<sensor_id>|<sn_ctr>|<sn_hmac>")
 *               (gateway_ip rỗng khi chưa có IP). CÙNG payload cho MQTT gateway/<id>/data và HTTP POST /api/device/data
 *               — backend kiểm hai đường bằng cùng logic (bất biến 4, 5).
 *   Ack lệnh v2 {v:2, command_id, status, power?, ts, hmac}
 *               hmac = HMAC(secret gw, "v2|ack|<gw>|<device_uid>|<command_id>|<status>|<power>|<ts>"),
 *               power = "1" | "0" | "" (không có trường power); không có ctr (command_id dùng 1 lần).
 *   Heartbeat v2 {v:2, ts, ctr, hmac, body_raw:"<JSON nguyên văn {uptime, rssi?, ip?, fw_version, nodes[]}>"}
 *               hmac = HMAC(secret gw, "v2|hb|<gw>|<ts>|<ctr>|<sha256_hex(body_raw)>"); body_raw chỉ ASCII in được,
 *               ≤ GW_HEARTBEAT_BODY_MAX byte; ctr = sm_counter_next (backend chiếm trên dòng gateway).
 *   Camera v2   {v:2, type, ts, snapshot_id?, hmac}
 *               hmac = HMAC(secret gw, "v2|evt|<gw>|<cam_id>|<type>|<ts>|<snapshot_id hoặc rỗng>"); không có ctr.
 * gateway_id, home, device lấy từ TOPIC (broker ép CN = gateway_id), không nằm trong chuỗi JSON của ack/heartbeat/camera.
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

/**
 * Telemetry v2 của node `sensor_id`: data_raw = đúng các byte object data Node đã ký (KHÔNG parse lại — đưa vào JSON
 * dạng chuỗi), sn_hmac = chữ ký của Node (Gateway không kiểm, không có secret Node).
 */
char *gw_envelope_telemetry_v2(const char *sensor_id, int64_t sn_ts, int64_t sn_ctr, const char *sn_hmac,
                               const char *data_raw, size_t data_len);

/** Kích thước tối đa body_raw của heartbeat (backend từ chối lớn hơn). */
#define GW_HEARTBEAT_BODY_MAX 4096

/** device_uid = thiết bị trong topic .../device/<device_uid>/command/ack. power: 0/1, hoặc < 0 để bỏ trường. */
char *gw_envelope_ack(const char *device_uid, const char *command_id, bool ok, int power);

/** Heartbeat v2. NULL nếu chưa có giờ, thiếu bộ nhớ, hoặc body_raw > GW_HEARTBEAT_BODY_MAX / không phải ASCII. */
char *gw_envelope_heartbeat(uint32_t uptime_s, const gw_envelope_node_t *nodes, size_t count);

/** snapshot_id = NULL khi không có ảnh (camera không gửi kịp / upload lỗi). */
char *gw_envelope_camera_event(const char *device_id, const char *type, int64_t event_ts, const char *snapshot_id);

#ifdef __cplusplus
}
#endif
