/*
 * gw_api — Gateway → Backend qua HTTPS (API_DESIGN §8). Hàm CHẶN (tới vài giây): chỉ gọi từ task uplink.
 *
 *   POST /api/device/data            body = gw_envelope_telemetry (cùng payload MQTT) — đường dự phòng khi MQTT
 *                                    mất kết nối. ĐÃ CÓ ở backend (telemetry/features/ingest-http).
 *   POST /api/device/camera/snapshot body image/jpeg ≤ 200 KB; header X-Gateway-Id, X-Timestamp,
 *                                    X-Device-Id (camera), X-Trigger, X-Command-Id?, X-Signature =
 *                                    HMAC(secret gw, "<gateway_id>:<ts>:<device_id>:<trigger>:<command_id>:<sha256>")
 *                                    — <command_id> rỗng khi không có, <sha256> = SHA-256 hex thường của thân ảnh:
 *                                    chữ ký gắn với đúng ảnh + camera, không dùng lại được chữ ký "<gw>:<ts>" của
 *                                    telemetry/heartbeat. Trả 201 {snapshot_id}. ĐÃ CÓ (backend module camera).
 *
 * https:// kiểm chứng chứng chỉ bằng CA nhúng (gw_tls); http:// chỉ khi bật [DEV].
 */
#pragma once

#include <stddef.h>
#include <stdint.h>

#include "esp_err.h"

#ifdef __cplusplus
extern "C" {
#endif

#define GW_SNAPSHOT_ID_MAX 64

/** Lưu base URL (VD "https://192.168.1.100"). ESP_ERR_INVALID_ARG nếu scheme không được phép. */
esp_err_t gw_api_init(const char *base_url);

esp_err_t gw_api_post_telemetry(const char *json);

/** snapshot_id nhận về (có thể rỗng nếu backend không trả). */
esp_err_t gw_api_post_snapshot(const char *camera_id, const char *trigger, const char *command_id,
                               const uint8_t *jpeg, size_t len, char snapshot_id[GW_SNAPSHOT_ID_MAX + 1]);

#ifdef __cplusplus
}
#endif
