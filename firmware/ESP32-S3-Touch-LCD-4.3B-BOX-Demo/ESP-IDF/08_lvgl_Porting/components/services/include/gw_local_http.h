/*
 * gw_local_http — HTTP server cục bộ của Gateway, chỉ phục vụ Camera trên Local AP (API_DESIGN §10.2,
 * IOT_NODE_NETWORK §5.2, §6.2):
 *
 *   POST /local/camera/snapshot
 *     X-Device-Id, X-Timestamp, X-Signature = HMAC-SHA256(secret camera, "<device_id>:<unix_ts>")
 *     X-Trigger: motion | request,  X-Command-Id (khi chụp theo lệnh),  Content-Type: image/jpeg, ≤ 200 KB
 *   201 nhận · 400 thiếu/sai header · 401 sai HMAC/thiết bị lạ/lệch giờ · 403 không đến từ Local AP
 *   411 thiếu độ dài · 413 quá lớn · 415 không phải JPEG · 503 Gateway chưa có giờ / đang bận
 *
 * Kiểm theo thứ tự: interface (Local AP) → header → thiết bị là camera đã ghép → HMAC + cửa sổ ±300 s → kích thước
 * → mới đọc thân (không tốn RAM cho yêu cầu chưa xác thực). Nội dung ảnh không được ký (cùng giới hạn với
 * telemetry): toàn vẹn dựa vào WPA2 của Local AP.
 */
#pragma once

#include <stdbool.h>
#include <stddef.h>
#include <stdint.h>

#include "esp_err.h"

#ifdef __cplusplus
extern "C" {
#endif

#define GW_SNAPSHOT_MAX_BYTES (200 * 1024)
#define GW_COMMAND_ID_MAX 64

typedef enum {
    GW_SNAP_MOTION = 0,
    GW_SNAP_REQUEST = 1,
} gw_snap_trigger_t;

typedef struct {
    size_t camera_idx;                        /* chỉ số trong gw_registry */
    gw_snap_trigger_t trigger;
    char command_id[GW_COMMAND_ID_MAX + 1];   /* "" nếu không chụp theo lệnh */
    int64_t ts;                               /* X-Timestamp đã kiểm */
    uint8_t *jpeg;                            /* PSRAM — bên nhận giải phóng bằng free() */
    size_t len;
} gw_snapshot_t;

/** Trả true = đã nhận quyền sở hữu snap->jpeg; false = bận (Gateway trả 503 và tự giải phóng ảnh). */
typedef bool (*gw_snapshot_cb_t)(gw_snapshot_t *snap, void *ctx);

/** Cần gw_wifi_start và gw_registry_load trước. */
esp_err_t gw_local_http_start(gw_snapshot_cb_t on_snapshot, void *ctx);

#ifdef __cplusplus
}
#endif
