/*
 * gw_tls — CA nội bộ của dự án nhúng vào firmware (infra/pki/gen_mqtt_certs.sh → infra/mosquitto/certs/ca.crt,
 * chép thành certs/mqtt_ca.crt của project — gitignore). Dùng kiểm chứng Broker MQTT (8883) và HTTPS Backend.
 *
 * Bất biến 3: không tắt kiểm chứng TLS. Không có CA thì từ chối mqtts:// / https:// thay vì kết nối mù.
 * mqtt:// và http:// chỉ được khi bật [DEV] CONFIG_GW_DEV_ALLOW_PLAINTEXT.
 */
#pragma once

#include <stdbool.h>

#ifdef __cplusplus
extern "C" {
#endif

/** PEM của CA; NULL nếu lúc build chưa có certs/mqtt_ca.crt. */
const char *gw_tls_ca_pem(void);

/**
 * Kiểm URI được phép dùng: `secure_scheme` (VD "mqtts://") cần CA; `plain_scheme` (VD "mqtt://") cần [DEV].
 * *is_secure = true nếu là scheme an toàn.
 */
bool gw_tls_uri_allowed(const char *uri, const char *secure_scheme, const char *plain_scheme, bool *is_secure);

#ifdef __cplusplus
}
#endif
