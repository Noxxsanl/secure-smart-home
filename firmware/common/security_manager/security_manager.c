#include "security_manager.h"

#include <inttypes.h>
#include <stdbool.h>
#include <stdio.h>
#include <string.h>

#include "mbedtls/md.h"
#include "mbedtls/platform_util.h"
#include "mbedtls/sha256.h"

/* "v2|sn|" + id 64 + "|" + ts 20 + "|" + ctr 20 + "|" + sha 64 + NUL */
#define SM_MSG_V2_MAX 192
#define SM_UNIX_TS_MAX INT64_C(4102444800) /* 2100-01-01 */

static const char HEX_DIGITS[] = "0123456789abcdef";

esp_err_t sm_hmac_sha256_hex(const char *key, const char *msg, char out_hex[SM_HMAC_HEX_LEN + 1])
{
    if (key == NULL || msg == NULL || out_hex == NULL || key[0] == '\0') {
        return ESP_ERR_INVALID_ARG;
    }

    const mbedtls_md_info_t *md = mbedtls_md_info_from_type(MBEDTLS_MD_SHA256);
    if (md == NULL) {
        return ESP_FAIL;
    }

    uint8_t digest[32];
    int rc = mbedtls_md_hmac(md, (const unsigned char *)key, strlen(key),
                             (const unsigned char *)msg, strlen(msg), digest);
    if (rc != 0) {
        mbedtls_platform_zeroize(digest, sizeof(digest));
        return ESP_FAIL;
    }

    for (size_t i = 0; i < sizeof(digest); i++) {
        out_hex[2 * i] = HEX_DIGITS[digest[i] >> 4];
        out_hex[2 * i + 1] = HEX_DIGITS[digest[i] & 0x0f];
    }
    out_hex[SM_HMAC_HEX_LEN] = '\0';
    mbedtls_platform_zeroize(digest, sizeof(digest));
    return ESP_OK;
}

static bool is_hex_char(char c)
{
    return (c >= '0' && c <= '9') || (c >= 'a' && c <= 'f') || (c >= 'A' && c <= 'F');
}

static char to_lower_hex(char c)
{
    return (c >= 'A' && c <= 'F') ? (char)(c - 'A' + 'a') : c;
}

/* Đúng 64 ký tự hex. */
static bool sig_hex_well_formed(const char *sig_hex)
{
    if (strnlen(sig_hex, SM_HMAC_HEX_LEN + 1) != SM_HMAC_HEX_LEN) {
        return false;
    }
    for (size_t i = 0; i < SM_HMAC_HEX_LEN; i++) {
        if (!is_hex_char(sig_hex[i])) {
            return false;
        }
    }
    return true;
}

/* So sánh thời gian hằng: luôn duyệt đủ 64 ký tự. `expected` là hex thường. */
static bool hex_equal_ct(const char *expected, const char *sig_hex)
{
    uint8_t diff = 0;
    for (size_t i = 0; i < SM_HMAC_HEX_LEN; i++) {
        diff |= (uint8_t)(expected[i] ^ to_lower_hex(sig_hex[i]));
    }
    return diff == 0;
}

bool sm_hmac_verify_hex(const char *key, const char *msg, const char *sig_hex)
{
    if (key == NULL || msg == NULL || sig_hex == NULL || !sig_hex_well_formed(sig_hex)) {
        return false;
    }
    char expected[SM_HMAC_HEX_LEN + 1];
    if (sm_hmac_sha256_hex(key, msg, expected) != ESP_OK) {
        return false;
    }
    bool ok = hex_equal_ct(expected, sig_hex);
    mbedtls_platform_zeroize(expected, sizeof(expected));
    return ok;
}

esp_err_t sm_sha256_hex(const void *data, size_t len, char out_hex[SM_HMAC_HEX_LEN + 1])
{
    if ((data == NULL && len > 0) || out_hex == NULL) {
        return ESP_ERR_INVALID_ARG;
    }
    uint8_t digest[32];
    if (mbedtls_sha256((const unsigned char *)data, len, digest, 0) != 0) {
        return ESP_FAIL;
    }
    for (size_t i = 0; i < sizeof(digest); i++) {
        out_hex[2 * i] = HEX_DIGITS[digest[i] >> 4];
        out_hex[2 * i + 1] = HEX_DIGITS[digest[i] & 0x0f];
    }
    out_hex[SM_HMAC_HEX_LEN] = '\0';
    return ESP_OK;
}

esp_err_t sm_sensor_sign_v2(const char *secret, const char *device_id, int64_t ts, int64_t ctr, const char *data,
                            size_t data_len, char out_hex[SM_HMAC_HEX_LEN + 1])
{
    if (device_id == NULL || device_id[0] == '\0' || strchr(device_id, '|') != NULL || data == NULL || data_len == 0 ||
        ts <= 0 || ctr <= 0) {
        return ESP_ERR_INVALID_ARG;
    }
    char sha[SM_HMAC_HEX_LEN + 1];
    esp_err_t err = sm_sha256_hex(data, data_len, sha);
    if (err != ESP_OK) {
        return err;
    }
    char msg[SM_MSG_V2_MAX];
    int n = snprintf(msg, sizeof(msg), "v2|sn|%s|%" PRId64 "|%" PRId64 "|%s", device_id, ts, ctr, sha);
    if (n <= 0 || (size_t)n >= sizeof(msg)) {
        return ESP_ERR_INVALID_SIZE;
    }
    return sm_hmac_sha256_hex(secret, msg, out_hex);
}

/* "v2|cam-up|" + id 64 + ts 20 + ctr 20 + trigger 16 + command_id 64 + dấu '|' + NUL */
#define SM_MSG_CAM_MAX 256

static bool field_ok(const char *s, bool allow_empty)
{
    if (s == NULL) {
        return allow_empty;
    }
    if (s[0] == '\0') {
        return allow_empty;
    }
    return strchr(s, '|') == NULL;
}

static esp_err_t build_cam_up_msg(const char *cam_id, int64_t ts, int64_t ctr, const char *trigger,
                                  const char *command_id, char *buf, size_t cap)
{
    if (!field_ok(cam_id, false) || !field_ok(trigger, false) || !field_ok(command_id, true) || ts <= 0 || ctr <= 0) {
        return ESP_ERR_INVALID_ARG;
    }
    int n = snprintf(buf, cap, "v2|cam-up|%s|%" PRId64 "|%" PRId64 "|%s|%s", cam_id, ts, ctr, trigger,
                     command_id != NULL ? command_id : "");
    return (n > 0 && (size_t)n < cap) ? ESP_OK : ESP_ERR_INVALID_SIZE;
}

static esp_err_t build_cam_stream_msg(const char *cam_id, int64_t ts, int64_t ctr, const char *fs, int q, char *buf,
                                      size_t cap)
{
    if (!field_ok(cam_id, false) || !field_ok(fs, false) || q <= 0 || ts <= 0 || ctr <= 0) {
        return ESP_ERR_INVALID_ARG;
    }
    int n = snprintf(buf, cap, "v2|cam-stream|%s|%" PRId64 "|%" PRId64 "|%s|%d", cam_id, ts, ctr, fs, q);
    return (n > 0 && (size_t)n < cap) ? ESP_OK : ESP_ERR_INVALID_SIZE;
}

/* Cửa sổ ±300 s rồi so thời gian hằng chữ ký với HMAC(secret, msg). */
static sm_verify_result_t verify_msg_in_window(const char *secret, const char *msg, int64_t ts, const char *sig_hex,
                                               int64_t now_unix)
{
    if (secret == NULL || sig_hex == NULL || !sig_hex_well_formed(sig_hex)) {
        return SM_VERIFY_BAD_INPUT;
    }
    if (ts < 0 || ts > SM_UNIX_TS_MAX || now_unix < 0 || now_unix > SM_UNIX_TS_MAX) {
        return SM_VERIFY_BAD_INPUT;
    }
    int64_t skew = now_unix - ts;
    if (skew > SM_TIMESTAMP_WINDOW_S || skew < -SM_TIMESTAMP_WINDOW_S) {
        return SM_VERIFY_EXPIRED;
    }
    char expected[SM_HMAC_HEX_LEN + 1];
    if (sm_hmac_sha256_hex(secret, msg, expected) != ESP_OK) {
        return SM_VERIFY_BAD_INPUT;
    }
    bool ok = hex_equal_ct(expected, sig_hex);
    mbedtls_platform_zeroize(expected, sizeof(expected));
    return ok ? SM_VERIFY_OK : SM_VERIFY_MISMATCH;
}

esp_err_t sm_cam_upload_sign(const char *secret, const char *cam_id, int64_t ts, int64_t ctr, const char *trigger,
                             const char *command_id, char out_hex[SM_HMAC_HEX_LEN + 1])
{
    char msg[SM_MSG_CAM_MAX];
    esp_err_t err = build_cam_up_msg(cam_id, ts, ctr, trigger, command_id, msg, sizeof(msg));
    if (err != ESP_OK) {
        return err;
    }
    return sm_hmac_sha256_hex(secret, msg, out_hex);
}

sm_verify_result_t sm_cam_upload_verify(const char *secret, const char *cam_id, int64_t ts, int64_t ctr,
                                        const char *trigger, const char *command_id, const char *sig_hex,
                                        int64_t now_unix)
{
    char msg[SM_MSG_CAM_MAX];
    if (build_cam_up_msg(cam_id, ts, ctr, trigger, command_id, msg, sizeof(msg)) != ESP_OK) {
        return SM_VERIFY_BAD_INPUT;
    }
    return verify_msg_in_window(secret, msg, ts, sig_hex, now_unix);
}

esp_err_t sm_cam_stream_sign(const char *secret, const char *cam_id, int64_t ts, int64_t ctr, const char *fs, int q,
                             char out_hex[SM_HMAC_HEX_LEN + 1])
{
    char msg[SM_MSG_CAM_MAX];
    esp_err_t err = build_cam_stream_msg(cam_id, ts, ctr, fs, q, msg, sizeof(msg));
    if (err != ESP_OK) {
        return err;
    }
    return sm_hmac_sha256_hex(secret, msg, out_hex);
}

sm_verify_result_t sm_cam_stream_verify(const char *secret, const char *cam_id, int64_t ts, int64_t ctr, const char *fs,
                                        int q, const char *sig_hex, int64_t now_unix)
{
    char msg[SM_MSG_CAM_MAX];
    if (build_cam_stream_msg(cam_id, ts, ctr, fs, q, msg, sizeof(msg)) != ESP_OK) {
        return SM_VERIFY_BAD_INPUT;
    }
    return verify_msg_in_window(secret, msg, ts, sig_hex, now_unix);
}
