/*
 * Chụp ảnh và gửi Gateway: POST http://<ip-gateway>/local/camera/snapshot (API_DESIGN §10.2, IOT_NODE_NETWORK §5.2).
 *
 *   X-Device-Id, X-Timestamp, X-Signature = HMAC-SHA256(secret_camera, "<device_id>:<unix_ts>")
 *   X-Trigger: motion | request,  X-Command-Id (khi chụp theo lệnh),  Content-Type: image/jpeg, ≤ 200 KB
 *   Gateway trả 201 nhận / 401 sai HMAC / 413 quá lớn.
 */
#pragma once

#include <stdbool.h>
#include "cam_config.h"
#include "esp_err.h"

#define CAM_SNAPSHOT_MAX_BYTES (200 * 1024)

typedef enum {
    CAM_TRIGGER_MOTION,
    CAM_TRIGGER_REQUEST,
} cam_trigger_t;

/** Báo kết quả chụp theo lệnh (để gửi CMD_ACK). Không gọi cho ảnh do chuyển động. */
typedef void (*cam_snapshot_done_cb_t)(const char *command_id, bool ok);

esp_err_t cam_snapshot_start(const cam_config_t *cfg, cam_snapshot_done_cb_t on_done);

/** Xếp hàng 1 yêu cầu chụp (không chặn). command_id = NULL với ảnh do chuyển động. false nếu hàng đợi đầy. */
bool cam_snapshot_request(cam_trigger_t trigger, const char *command_id);
