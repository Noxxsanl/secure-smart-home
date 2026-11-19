/*
 * gw_time — đồng hồ của Gateway (IOT_NODE_NETWORK §7).
 *
 *   Khởi động: đọc RTC (PCF85063, pin CR927) → có giờ ngay cả khi chưa có Internet.
 *   Có Internet: SNTP đồng bộ, rồi ghi lại vào RTC.
 *
 * Gateway là nguồn giờ của Node/Camera (TIME_SYNC qua ESP-NOW). Chưa có giờ thì KHÔNG ký/kiểm HMAC
 * (backend và node chỉ nhận lệch ±300 giây).
 *
 * services không biết driver RTC: tầng application truyền hàm đọc/ghi qua gw_time_rtc_t.
 */
#pragma once

#include <stdbool.h>
#include <stdint.h>

#include "esp_err.h"

#ifdef __cplusplus
extern "C" {
#endif

typedef struct {
    esp_err_t (*read)(int64_t *unix_ts);
    esp_err_t (*write)(int64_t unix_ts);
} gw_time_rtc_t;

/** Đọc RTC (nếu có) để có giờ sớm. rtc = NULL khi board không có RTC. */
void gw_time_init(const gw_time_rtc_t *rtc);

/** Bật SNTP. Cần esp_netif_init + event loop trước; SNTP tự thử lại khi chưa có mạng. */
esp_err_t gw_time_start_sntp(const char *server);

bool gw_time_is_synced(void);

/** Giờ unix hiện tại; false nếu chưa đồng bộ. */
bool gw_time_now(int64_t *out);

/** "ntp" | "rtc" | "none". */
const char *gw_time_source(void);

#ifdef __cplusplus
}
#endif
