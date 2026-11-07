#include "gw_tls.h"

#include <string.h>

#include "esp_log.h"
#include "sdkconfig.h"

static const char *TAG = "gw_tls";

/* EMBED_TXTFILES trong CMakeLists: certs/mqtt_ca.crt của project, hoặc file rỗng khi chưa có. */
extern const char mqtt_ca_crt_start[] asm("_binary_mqtt_ca_crt_start");

const char *gw_tls_ca_pem(void)
{
    return strstr(mqtt_ca_crt_start, "-----BEGIN CERTIFICATE-----") != NULL ? mqtt_ca_crt_start : NULL;
}

bool gw_tls_uri_allowed(const char *uri, const char *secure_scheme, const char *plain_scheme, bool *is_secure)
{
    *is_secure = false;
    if (uri == NULL || uri[0] == '\0') {
        return false;
    }
    if (strncmp(uri, secure_scheme, strlen(secure_scheme)) == 0) {
        if (gw_tls_ca_pem() == NULL) {
            ESP_LOGE(TAG, "%s needs CA: copy infra/mosquitto/certs/ca.crt to certs/mqtt_ca.crt and rebuild", uri);
            return false;
        }
        *is_secure = true;
        return true;
    }
    if (strncmp(uri, plain_scheme, strlen(plain_scheme)) == 0) {
#if defined(CONFIG_GW_DEV_ALLOW_PLAINTEXT)
        ESP_LOGW(TAG, "DEV: %s without TLS — disable for demo/production", uri);
        return true;
#else
        ESP_LOGE(TAG, "%s refused: plaintext disabled (menuconfig [DEV] CONFIG_GW_DEV_ALLOW_PLAINTEXT)", uri);
        return false;
#endif
    }
    ESP_LOGE(TAG, "%s: unsupported scheme (expect %s)", uri, secure_scheme);
    return false;
}
