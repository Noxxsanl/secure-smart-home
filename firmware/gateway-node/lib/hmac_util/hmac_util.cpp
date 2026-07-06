#include "hmac_util.h"
#include "mbedtls/md.h"
#include <string.h>
#include <stdio.h>

// Dùng mbedTLS (đi kèm ESP-IDF / Arduino-ESP32) để tính HMAC-SHA256.
// mbedTLS là thư viện crypto có tăng tốc phần cứng duy nhất trên ESP32 không cần
// thêm dependency, và cho kết quả khớp với crypto.createHmac("sha256") của Node.js
// dùng ở backend để xác minh.
// out phải trỏ đến buffer 65 byte (64 ký tự hex + null terminator).
bool computeHMAC(const char* key, const char* msg, char out[65]) {
    uint8_t raw[32];
    mbedtls_md_context_t ctx;
    mbedtls_md_init(&ctx);

    const mbedtls_md_info_t* info = mbedtls_md_info_from_type(MBEDTLS_MD_SHA256);
    if (!info) {
        mbedtls_md_free(&ctx);
        return false;
    }

    // Tham số thứ ba của mbedtls_md_setup (1) bật chế độ HMAC.
    bool ok = (mbedtls_md_setup(&ctx, info, 1) == 0) &&
              (mbedtls_md_hmac_starts(&ctx, (const uint8_t*)key, strlen(key)) == 0) &&
              (mbedtls_md_hmac_update(&ctx, (const uint8_t*)msg, strlen(msg)) == 0) &&
              (mbedtls_md_hmac_finish(&ctx, raw) == 0);

    mbedtls_md_free(&ctx);
    if (!ok) return false;

    // Mã hóa bytes thô thành chuỗi hex chữ thường (khớp với .toString("hex") của Node.js)
    for (int i = 0; i < 32; i++) snprintf(out + i * 2, 3, "%02x", raw[i]);
    return true;
}
