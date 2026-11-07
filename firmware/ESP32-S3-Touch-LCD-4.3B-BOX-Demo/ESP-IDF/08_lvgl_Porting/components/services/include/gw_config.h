/*
 * gw_config — cấu hình Gateway đọc từ NVS (Firmware §16). Giai đoạn dev nạp bằng nvs_dev.csv (gitignore) — README.
 *
 *   identity/device_uuid      gateway_id trên backend (device_type = gateway)
 *   identity/device_secret    secret gateway (backend trả 1 lần lúc tạo — bất biến 1). CHỈ nằm trong gw_config.c:
 *                             tầng khác ký/kiểm qua gw_config_sign/_verify, không đọc được giá trị.
 *   wifi/ssid, wifi/password  WiFi router của nhà (2.4 GHz). Thiếu → chỉ chạy Local AP, không lên Server.
 *   local_ap/ssid, /password  Local AP cho Camera (WPA2, mật khẩu ≥ 8 ký tự). Thiếu → tự sinh và lưu NVS.
 *   cloud/mqtt_uri, /api_url  ghi đè mặc định trong menuconfig (không bí mật)
 *   cloud/home_id             (tuỳ chọn) home_id trên backend; không có thì học từ topic lệnh hợp lệ đầu tiên
 *
 * Không log mật khẩu/secret (bất biến 2).
 */
#pragma once

#include <stdbool.h>
#include <stddef.h>
#include <stdint.h>

#include "esp_err.h"
#include "security_manager.h"

#ifdef __cplusplus
extern "C" {
#endif

#define GW_ID_MAX 64
#define GW_URI_MAX 128
#define GW_HOME_ID_MAX 15

typedef struct {
    char device_id[GW_ID_MAX + 1];
    char wifi_ssid[33];
    char wifi_password[65];
    bool has_wifi;
    char ap_ssid[33];
    char ap_password[65];
    char mqtt_uri[GW_URI_MAX + 1];
    char api_url[GW_URI_MAX + 1];
    char home_id[GW_HOME_ID_MAX + 1];   /* "" = chưa biết */
} gw_config_t;

/** Cần nvs_flash_init() trước. ESP_ERR_NOT_FOUND nếu thiếu identity (Gateway chưa được cấp phát). */
esp_err_t gw_config_load(gw_config_t *out);

/** Xoá mật khẩu WiFi/Local AP khỏi bản sao trong RAM sau khi đã giao cho driver WiFi. */
void gw_config_wipe_passwords(gw_config_t *cfg);

/** gateway_id (công khai) — "" nếu chưa load. */
const char *gw_config_gateway_id(void);

/** HMAC-SHA256(secret gateway, msg) hex thường. */
esp_err_t gw_config_sign(const char *msg, char out_hex[SM_HMAC_HEX_LEN + 1]);

/** HMAC-SHA256(secret gateway, "<gateway_id>:<ts>") — gw_hmac của telemetry, X-Signature của API thiết bị (/api/device). */
esp_err_t gw_config_sign_ts(int64_t ts, char out_hex[SM_HMAC_HEX_LEN + 1]);

/** So chữ ký lệnh từ Server với HMAC-SHA256(secret gateway, msg), thời gian hằng. */
bool gw_config_verify(const char *msg, const char *sig_hex);

/** Kiểm chuỗi id: [A-Za-z0-9_-], 1..max ký tự (device_id, command_id). Dùng chung cho các module services. */
bool gw_valid_id(const char *s, size_t max);

/** Kiểm token: [a-z0-9_], 1..max ký tự (action, event, tên trường đo). */
bool gw_valid_token(const char *s, size_t max);

#ifdef __cplusplus
}
#endif
