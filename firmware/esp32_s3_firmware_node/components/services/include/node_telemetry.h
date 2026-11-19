/*
 * Dựng body khung ESP-NOW TELEMETRY_V2 (0x12) — chữ ký v2 (API_DESIGN §3, §11):
 *
 *   {"sn_timestamp":<unix>,"sn_ctr":<ctr>,"sn_hmac":"<64 hex>","data":{"temperature":28.4,...}}
 *
 * sn_hmac = HMAC-SHA256(secret node, "v2|sn|<device_id>|<ts>|<ctr>|<sha256_hex(data)>") hex thường (bất biến 5,
 * common/security_manager sm_sensor_sign_v2): ký CẢ nội dung data và bộ đếm ctr tăng ngặt (sm_counter, common/security_manager) → backend
 * từ chối gói bị sửa hoặc phát lại. Secret Node chỉ Node và backend biết — Gateway không giữ, chỉ chuyển nguyên văn.
 * Không gửi sensor_id: Gateway biết node theo MAC đã ghép và thêm vào gói gửi Server.
 * Chưa có giờ từ Gateway → không ký (ESP_ERR_INVALID_STATE): backend từ chối lệch > 300 giây.
 *
 * Toàn bộ ≤ 246 byte (giới hạn ESP-NOW v1 trừ 4 byte đầu khung): phần đầu ~135 byte, còn ~110 byte cho data.
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
