#include "gw_time.h"

#include <inttypes.h>
#include <stdatomic.h>
#include <sys/time.h>
#include <time.h>

#include "esp_log.h"
#include "esp_netif_sntp.h"

static const char *TAG = "gw_time";

#define TS_MIN INT64_C(1700000000)   /* 2023-11-14 */
#define TS_MAX INT64_C(4102444799)   /* 2099-12-31 */

typedef enum { SRC_NONE = 0, SRC_RTC, SRC_NTP } source_t;

static gw_time_rtc_t s_rtc;
static atomic_int s_source = SRC_NONE;

/* Chạy trong task lwIP/SNTP khi nhận được giờ — ghi RTC (I2C, vài trăm µs). */
static void on_sntp_sync(struct timeval *tv)
{
    int64_t ts = (int64_t)tv->tv_sec;
    if (ts < TS_MIN || ts > TS_MAX) {
        ESP_LOGW(TAG, "ignore bogus NTP time %" PRId64, ts);
        return;
    }
    if (atomic_exchange(&s_source, SRC_NTP) != SRC_NTP) {
        ESP_LOGI(TAG, "time synced from NTP: %" PRId64, ts);
    }
    if (s_rtc.write != NULL && s_rtc.write(ts) != ESP_OK) {
        ESP_LOGW(TAG, "could not update RTC");
    }
}

void gw_time_init(const gw_time_rtc_t *rtc)
{
    if (rtc != NULL) {
        s_rtc = *rtc;
    }
    if (s_rtc.read == NULL) {
        ESP_LOGW(TAG, "no RTC — waiting for NTP");
        return;
    }
    int64_t ts = 0;
    esp_err_t err = s_rtc.read(&ts);
    if (err != ESP_OK || ts < TS_MIN || ts > TS_MAX) {
        ESP_LOGW(TAG, "RTC has no valid time (%s) — waiting for NTP", esp_err_to_name(err));
        return;
    }
    struct timeval tv = {.tv_sec = (time_t)ts, .tv_usec = 0};
    settimeofday(&tv, NULL);
    atomic_store(&s_source, SRC_RTC);
    ESP_LOGI(TAG, "time from RTC: %" PRId64, ts);
}

esp_err_t gw_time_start_sntp(const char *server)
{
    esp_sntp_config_t cfg = ESP_NETIF_SNTP_DEFAULT_CONFIG(server);
    cfg.sync_cb = on_sntp_sync;
    esp_err_t err = esp_netif_sntp_init(&cfg);
    if (err != ESP_OK) {
        ESP_LOGW(TAG, "SNTP init failed: %s", esp_err_to_name(err));
    }
    return err;
}

bool gw_time_is_synced(void)
{
    return atomic_load(&s_source) != SRC_NONE;
}

bool gw_time_now(int64_t *out)
{
    if (out == NULL || atomic_load(&s_source) == SRC_NONE) {
        return false;
    }
    *out = (int64_t)time(NULL);
    return true;
}

const char *gw_time_source(void)
{
    switch (atomic_load(&s_source)) {
    case SRC_NTP:
        return "ntp";
    case SRC_RTC:
        return "rtc";
    default:
        return "none";
    }
}
