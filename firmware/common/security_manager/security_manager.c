#include "security_manager.h"

#include <inttypes.h>
#include <stdbool.h>
#include <stdio.h>
#include <string.h>

#include "mbedtls/md.h"
#include "mbedtls/platform_util.h"

/* "<device_id>:<unix_ts>" — device_id tối đa 64 ký tự (UUID 36), ts tối đa 20 chữ số. */
#define SM_MSG_MAX 96
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

static esp_err_t build_message(const char *device_id, int64_t unix_ts, char *buf, size_t cap)
{
    if (device_id == NULL || device_id[0] == '\0') {
        return ESP_ERR_INVALID_ARG;
    }
    int n = snprintf(buf, cap, "%s:%" PRId64, device_id, unix_ts);
    return (n > 0 && (size_t)n < cap) ? ESP_OK : ESP_ERR_INVALID_SIZE;
}

esp_err_t sm_device_sign(const char *secret, const char *device_id, int64_t unix_ts,
                         char out_hex[SM_HMAC_HEX_LEN + 1])
{
    char msg[SM_MSG_MAX];
    esp_err_t err = build_message(device_id, unix_ts, msg, sizeof(msg));
    if (err != ESP_OK) {
        return err;
    }
    return sm_hmac_sha256_hex(secret, msg, out_hex);
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

sm_verify_result_t sm_device_verify(const char *secret, const char *device_id, int64_t unix_ts,
                                    const char *sig_hex, int64_t now_unix)
{
    if (secret == NULL || device_id == NULL || sig_hex == NULL) {
        return SM_VERIFY_BAD_INPUT;
    }
    if (!sig_hex_well_formed(sig_hex)) {
        return SM_VERIFY_BAD_INPUT;
    }

    /* Chặn giá trị vô lý trước khi trừ (tránh tràn int64 với ts do bên ngoài gửi). */
    if (unix_ts < 0 || unix_ts > SM_UNIX_TS_MAX || now_unix < 0 || now_unix > SM_UNIX_TS_MAX) {
        return SM_VERIFY_BAD_INPUT;
    }
    int64_t skew = now_unix - unix_ts;
    if (skew > SM_TIMESTAMP_WINDOW_S || skew < -SM_TIMESTAMP_WINDOW_S) {
        return SM_VERIFY_EXPIRED;
    }

    char expected[SM_HMAC_HEX_LEN + 1];
    if (sm_device_sign(secret, device_id, unix_ts, expected) != ESP_OK) {
        return SM_VERIFY_BAD_INPUT;
    }

    bool ok = hex_equal_ct(expected, sig_hex);
    mbedtls_platform_zeroize(expected, sizeof(expected));
    return ok ? SM_VERIFY_OK : SM_VERIFY_MISMATCH;
}
