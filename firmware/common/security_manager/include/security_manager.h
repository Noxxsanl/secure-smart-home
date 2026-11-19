/*
 * security_manager — HMAC thiết bị dùng chung cho mọi firmware ESP-IDF (Camera, Gateway S3, Node).
 *
 * Chuỗi ký (bất biến 5, CLAUDE.md), HMAC-SHA256 → 64 ký tự hex thường:
 *   - telemetry v2 của Node (sm_sensor_sign_v2): "v2|sn|<device_id>|<ts>|<ctr>|<sha256_hex(data)>" — ký CẢ nội dung
 *     (đúng các byte JSON data) và bộ đếm tăng ngặt ctr (backend lưu last_ctr → gói phát lại bị từ chối);
 *   - ảnh Camera → Gateway (sm_cam_upload_sign/verify): "v2|cam-up|<cam_id>|<ts>|<ctr>|<trigger>|<command_id hoặc rỗng>";
 *   - luồng Gateway → Camera (sm_cam_stream_sign/verify): "v2|cam-stream|<cam_id>|<ts>|<ctr>|<fs>|<q>" (fs, q đã chuẩn hoá);
 *   - Gateway → Server (MQTT) dựng chuỗi "v2|hb|…", "v2|ack|…", "v2|evt|…" ở gw_envelope bằng sm_hmac_sha256_hex.
 * ctr: bộ đếm tăng ngặt dùng chung (sm_counter_next, xem sm_counter.h); bên nhận tự so ctr với last_ctr của bên gửi.
 * Phải khớp byte-by-byte với backend (backend/src/modules/devices/domain/signature-v2.ts, hmac.service.ts):
 *   - key là chuỗi secret nguyên văn (byte UTF-8), KHÔNG giải mã hex;
 *   - cửa sổ chống replay ±300 giây.
 *
 * Không chép hàm này vào từng project — project trỏ tới firmware/common bằng EXTRA_COMPONENT_DIRS.
 * Không log secret hay chữ ký (bất biến 2).
 */
#pragma once

#include <stdbool.h>
#include <stddef.h>
#include <stdint.h>
#include "esp_err.h"

#ifdef __cplusplus
extern "C" {
#endif

#define SM_HMAC_HEX_LEN 64          /* SHA-256 = 32 byte = 64 ký tự hex */
#define SM_TIMESTAMP_WINDOW_S 300   /* giống TIMESTAMP_WINDOW_SECONDS của backend */

typedef enum {
    SM_VERIFY_OK = 0,
    SM_VERIFY_BAD_INPUT,   /* thiếu tham số, chữ ký sai độ dài / không phải hex */
    SM_VERIFY_EXPIRED,     /* |now - ts| > SM_TIMESTAMP_WINDOW_S */
    SM_VERIFY_MISMATCH,    /* chữ ký không khớp */
} sm_verify_result_t;

/** HMAC-SHA256(key, msg) → hex thường, kết thúc bằng NUL. */
esp_err_t sm_hmac_sha256_hex(const char *key, const char *msg, char out_hex[SM_HMAC_HEX_LEN + 1]);

/**
 * So chữ ký `sig_hex` (64 ký tự hex, hoa hoặc thường) với HMAC-SHA256(key, msg), thời gian hằng.
 * Dùng cho chuỗi ký khác dạng thiết bị — VD Gateway kiểm lệnh từ Server "<command_id>:<device_id>:<action>:<ts>"
 * (API_DESIGN §3). Không kiểm cửa sổ thời gian: bên gọi tự kiểm ts trước.
 */
bool sm_hmac_verify_hex(const char *key, const char *msg, const char *sig_hex);

/** SHA-256(data) → 64 ký tự hex thường + NUL. */
esp_err_t sm_sha256_hex(const void *data, size_t len, char out_hex[SM_HMAC_HEX_LEN + 1]);

/**
 * Chữ ký telemetry v2 của Node: HMAC-SHA256(secret, "v2|sn|<device_id>|<ts>|<ctr>|<sha256_hex(data)>").
 * `data` = đúng các byte JSON object Node gửi (Gateway chuyển nguyên văn, không parse lại). device_id không được chứa '|'.
 */
esp_err_t sm_sensor_sign_v2(const char *secret, const char *device_id, int64_t ts, int64_t ctr, const char *data,
                            size_t data_len, char out_hex[SM_HMAC_HEX_LEN + 1]);

/**
 * Camera → Gateway, POST /local/camera/snapshot:
 *   HMAC-SHA256(secret camera, "v2|cam-up|<cam_id>|<ts>|<ctr>|<trigger>|<command_id hoặc rỗng>").
 * `command_id` NULL = rỗng. Mọi trường không được chứa '|'. Không băm ảnh.
 */
esp_err_t sm_cam_upload_sign(const char *secret, const char *cam_id, int64_t ts, int64_t ctr, const char *trigger,
                             const char *command_id, char out_hex[SM_HMAC_HEX_LEN + 1]);

/**
 * Gateway kiểm chữ ký cam-up: cửa sổ ±SM_TIMESTAMP_WINDOW_S trước, rồi so thời gian hằng.
 * KHÔNG kiểm ctr — bên gọi so ctr với last_ctr của camera và chỉ cập nhật sau khi nhận đủ body hợp lệ.
 */
sm_verify_result_t sm_cam_upload_verify(const char *secret, const char *cam_id, int64_t ts, int64_t ctr,
                                        const char *trigger, const char *command_id, const char *sig_hex,
                                        int64_t now_unix);

/**
 * Gateway → Camera, GET /stream?fs=&q=:
 *   HMAC-SHA256(secret camera, "v2|cam-stream|<cam_id>|<ts>|<ctr>|<fs>|<q>").
 * `fs`, `q` là giá trị ĐÃ CHUẨN HOÁ camera sẽ dùng (vắng fs → "vga", vắng q → 12; q thập phân, không số 0 đầu).
 */
esp_err_t sm_cam_stream_sign(const char *secret, const char *cam_id, int64_t ts, int64_t ctr, const char *fs, int q,
                             char out_hex[SM_HMAC_HEX_LEN + 1]);

/** Camera kiểm chữ ký cam-stream (cửa sổ ±300 s rồi so thời gian hằng). KHÔNG kiểm ctr — bên gọi tự kiểm. */
sm_verify_result_t sm_cam_stream_verify(const char *secret, const char *cam_id, int64_t ts, int64_t ctr, const char *fs,
                                        int q, const char *sig_hex, int64_t now_unix);

#ifdef __cplusplus
}
#endif
