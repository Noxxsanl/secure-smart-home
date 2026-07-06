#include "hmac_util.h"
#include "mbedtls/md.h"

String computeHMAC(const String& key, const String& message) {
    uint8_t hmacResult[32];

    mbedtls_md_context_t ctx;
    mbedtls_md_init(&ctx);

    const mbedtls_md_info_t* mdInfo = mbedtls_md_info_from_type(MBEDTLS_MD_SHA256);
    mbedtls_md_setup(&ctx, mdInfo, 1 /* hmac=1 */);
    mbedtls_md_hmac_starts(&ctx, (const uint8_t*)key.c_str(), key.length());
    mbedtls_md_hmac_update(&ctx, (const uint8_t*)message.c_str(), message.length());
    mbedtls_md_hmac_finish(&ctx, hmacResult);
    mbedtls_md_free(&ctx);

    String hex;
    hex.reserve(64);
    for (int i = 0; i < 32; i++) {
        char buf[3];
        snprintf(buf, sizeof(buf), "%02x", hmacResult[i]);
        hex += buf;
    }
    return hex;
}
