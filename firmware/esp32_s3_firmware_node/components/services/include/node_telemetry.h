/*
 * Dựng sensor_payload cho ESP-NOW TELEMETRY — y hệt payload backend đang nhận (API_DESIGN §9.1, §11):
 *
 *   {"sensor_id":"<device_id>","sn_timestamp":<unix>,"sn_hmac":"<64 hex>","data":{"temperature":28.4,...}}
 *
 * sn_hmac = HMAC-SHA256(secret node, "<device_id>:<unix_ts>") hex thường (bất biến 5, common/security_manager).
 * Chưa có giờ từ Gateway → không ký (ESP_ERR_INVALID_STATE): backend từ chối lệch > 300 giây.
 *
 * Tên trường đề xuất cho node phòng khách: temperature (°C), humidity (%), light (lux).
 * Toàn bộ ≤ 246 byte (giới hạn ESP-NOW v1 trừ 4 byte đầu khung) — 3 trường đo vừa đủ.
 */
#pragma once

#include <stddef.h>
#include <stdint.h>

#include "esp_err.h"
#include "node_config.h"

#ifdef __cplusplus
extern "C" {
#endif

#define NODE_TELEMETRY_MAX_LEN 246

typedef struct {
    const char *key;     /* [a-z0-9_], VD "temperature" */
    float value;         /* NaN/Inf (cảm biến lỗi) bị bỏ qua */
    uint8_t decimals;    /* 0..3 */
} node_metric_t;

/**
 * Ghi payload JSON (kết thúc NUL) vào `out`, `len` = độ dài không tính NUL.
 * ESP_ERR_INVALID_STATE nếu chưa có giờ; ESP_ERR_INVALID_SIZE nếu quá 246 byte;
 * ESP_ERR_INVALID_ARG nếu không còn trường đo hợp lệ nào.
 */
esp_err_t node_telemetry_build(const node_config_t *cfg, const node_metric_t *metrics, size_t count, char *out,
                               size_t cap, size_t *len);

/** build + node_link_send_telemetry. */
esp_err_t node_telemetry_send(const node_config_t *cfg, const node_metric_t *metrics, size_t count);

#ifdef __cplusplus
}
#endif
