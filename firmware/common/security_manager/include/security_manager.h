/*
 * security_manager — HMAC thiết bị dùng chung cho mọi firmware ESP-IDF (Camera, Gateway S3, Node).
 *
 * Chuỗi ký (bất biến 5, CLAUDE.md):  HMAC-SHA256(secret, "<device_id>:<unix_ts>")  → 64 ký tự hex thường.
 * Phải khớp byte-by-byte với backend (backend/src/modules/devices/domain/hmac.service.ts):
 *   - key là chuỗi secret nguyên văn (byte UTF-8), KHÔNG giải mã hex;
 *   - cửa sổ chống replay ±300 giây.
 *
 * Không chép hàm này vào từng project — project trỏ tới firmware/common bằng EXTRA_COMPONENT_DIRS.
 * Không log secret hay chữ ký (bất biến 2).
 */
#pragma once

#include <stdbool.h>
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

/** Ký "<device_id>:<unix_ts>" bằng secret của thiết bị. */
esp_err_t sm_device_sign(const char *secret, const char *device_id, int64_t unix_ts,
                         char out_hex[SM_HMAC_HEX_LEN + 1]);

/**
 * Kiểm chữ ký thiết bị: cửa sổ thời gian trước, rồi so sánh thời gian hằng (không lộ vị trí byte sai).
 * Chữ ký nhận cả hex hoa lẫn thường (backend dùng Buffer.from(hex) cũng vậy).
 */
sm_verify_result_t sm_device_verify(const char *secret, const char *device_id, int64_t unix_ts,
                                    const char *sig_hex, int64_t now_unix);

/**
 * So chữ ký `sig_hex` (64 ký tự hex, hoa hoặc thường) với HMAC-SHA256(key, msg), thời gian hằng.
 * Dùng cho chuỗi ký khác dạng thiết bị — VD Gateway kiểm lệnh từ Server "<command_id>:<device_id>:<action>:<ts>"
 * (API_DESIGN §3). Không kiểm cửa sổ thời gian: bên gọi tự kiểm ts trước.
 */
bool sm_hmac_verify_hex(const char *key, const char *msg, const char *sig_hex);

#ifdef __cplusplus
}
#endif
