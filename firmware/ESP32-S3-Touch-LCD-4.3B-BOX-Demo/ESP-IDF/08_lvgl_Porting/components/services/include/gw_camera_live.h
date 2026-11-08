/*
 * gw_camera_live — Gateway kéo luồng MJPEG của Camera trên Local AP (API_DESIGN §10.3, IOT_NODE_NETWORK §5.4):
 *
 *   GET http://<ip camera>/stream?fs=vga|qvga&q=<10..30>
 *   X-Device-Id, X-Timestamp, X-Signature = HMAC-SHA256(secret camera, "<device_id>:<unix_ts>")  (gw_registry_sign)
 *   200 multipart/x-mixed-replace, mỗi phần: Content-Type: image/jpeg, Content-Length: <n>, rồi n byte JPEG.
 *
 * - IP camera = IP mà DHCP của Local AP cấp cho MAC camera đã ghép (gw_registry) — không nhận IP do ai khai báo.
 * - Gateway là bên DUY NHẤT kéo luồng (camera chỉ cho 1 kết nối, trả 409 nếu đã có); người xem khác dùng chung khung.
 * - Mất kết nối / camera từ chối → thử lại sau 1, 2, 4 s; hỏng 3 lần liên tiếp → GW_LIVE_FAILED và tự dừng.
 * - Kích thước/chất lượng luồng: menuconfig "Gateway S3: services" (CONFIG_GW_CAMERA_LIVE_*).
 *
 * Kênh không TLS (giống POST /local/camera/snapshot): yêu cầu được ký, nội dung khung dựa vào WPA2 của Local AP.
 * Không log chữ ký/secret (bất biến 2).
 */
#pragma once

#include <stdbool.h>
#include <stddef.h>
#include <stdint.h>

#include "esp_err.h"

#ifdef __cplusplus
extern "C" {
#endif

#define GW_CAMERA_LIVE_FRAME_MAX (200 * 1024)   /* khung lớn hơn bị bỏ qua (VGA q=12 thường 15–40 KB) */

typedef enum {
    GW_LIVE_CONNECTING = 0,   /* đang mở kết nối lần đầu */
    GW_LIVE_STREAMING,        /* khung đầu tiên đã tới */
    GW_LIVE_RETRYING,         /* mất kết nối / bị từ chối, sắp thử lại */
    GW_LIVE_FAILED,           /* hỏng quá số lần thử — đã tự dừng */
    GW_LIVE_STOPPED,          /* dừng theo yêu cầu (gw_camera_live_stop hoặc chuyển camera) */
} gw_live_state_t;

/** Lý do của lần hỏng gần nhất (đi kèm GW_LIVE_RETRYING / GW_LIVE_FAILED). */
typedef enum {
    GW_LIVE_ERR_NONE = 0,
    GW_LIVE_ERR_NOT_ON_AP,      /* camera chưa vào Local AP / chưa có IP */
    GW_LIVE_ERR_NO_TIME,        /* Gateway chưa có giờ, không ký được */
    GW_LIVE_ERR_CONNECT,        /* không mở được TCP/HTTP */
    GW_LIVE_ERR_AUTH,           /* 401: secret camera trong NVS Gateway khác secret của camera, hoặc lệch giờ */
    GW_LIVE_ERR_BUSY,           /* 409: camera đang phát cho kết nối khác */
    GW_LIVE_ERR_CAM_NO_TIME,    /* 503: camera chưa nhận TIME_SYNC (ESP-NOW) */
    GW_LIVE_ERR_HTTP,           /* mã HTTP khác */
    GW_LIVE_ERR_STREAM,         /* luồng đứt / sai định dạng giữa chừng */
} gw_live_err_t;

typedef struct {
    /**
     * 1 khung JPEG hoàn chỉnh (bắt đầu FF D8), gọi trong task gw_live. Bộ đệm chỉ hợp lệ trong lúc gọi.
     * Được phép chặn (VD giải nén): camera dùng CAMERA_GRAB_LATEST nên khung cũ tự bị bỏ, không dồn trễ.
     */
    void (*on_frame)(size_t cam_idx, const uint8_t *jpeg, size_t len, void *ctx);
    /** Đổi trạng thái, gọi trong task gw_live — phải nhanh (đẩy sang task khác). */
    void (*on_state)(size_t cam_idx, gw_live_state_t state, gw_live_err_t err, int http_status, void *ctx);
    void *ctx;
} gw_camera_live_callbacks_t;

/** Tạo task + bộ đệm khung (PSRAM). Cần gw_wifi_start, gw_registry_load trước. */
esp_err_t gw_camera_live_init(const gw_camera_live_callbacks_t *cbs);

/** Bắt đầu kéo luồng camera cam_idx (không chặn). Đang kéo camera khác thì chuyển sang camera này. */
esp_err_t gw_camera_live_start(size_t cam_idx);

/** Dừng (không chặn): task đóng kết nối sau khung đang đọc, camera thấy socket đóng thì ngừng phát. */
void gw_camera_live_stop(void);

/** true khi đang được yêu cầu kéo luồng (kể cả lúc đang kết nối / chờ thử lại). */
bool gw_camera_live_active(void);

#ifdef __cplusplus
}
#endif
