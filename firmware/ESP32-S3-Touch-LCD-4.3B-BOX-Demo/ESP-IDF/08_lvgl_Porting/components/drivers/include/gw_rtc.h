/*
 * gw_rtc — RTC PCF85063A trên bus I2C chung (địa chỉ 0x51), pin CR927 giữ giờ khi mất điện.
 *
 * Lưu giờ UTC, năm 2000–2099. Gateway đọc RTC lúc khởi động khi chưa có Internet, ghi lại sau mỗi lần đồng bộ NTP
 * (IOT_NODE_NETWORK §7) — cần giờ đúng để ký/kiểm HMAC (cửa sổ ±300 s).
 */
#pragma once

#include <stdint.h>
#include "esp_err.h"

#ifdef __cplusplus
extern "C" {
#endif

/** Cài bus I2C (nếu chưa) và kiểm chip trả lời. Gọi sau gw_display_init. */
esp_err_t gw_rtc_init(void);

/** ESP_ERR_INVALID_STATE nếu chip báo mất dao động (cờ OS: hết pin / chưa từng đặt giờ) hoặc giờ vô lý. */
esp_err_t gw_rtc_read(int64_t *unix_ts);

esp_err_t gw_rtc_write(int64_t unix_ts);

#ifdef __cplusplus
}
#endif
