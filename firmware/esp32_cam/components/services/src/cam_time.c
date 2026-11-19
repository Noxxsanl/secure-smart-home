#include "cam_time.h"

#include <inttypes.h>
#include <stdatomic.h>
#include <sys/time.h>
#include <time.h>

#include "esp_log.h"
#include "sdkconfig.h"

#if defined(CONFIG_CAM_DEV_SNTP_SERVER)
#include "esp_netif_sntp.h"
#endif

static const char *TAG = "cam_time";

#define TS_MIN INT64_C(1700000000) /* 2023-11-14 */

static atomic_bool s_synced = false;

#if defined(CONFIG_CAM_DEV_SNTP_SERVER)
static void on_sntp_sync(struct timeval *tv)
{
    atomic_store(&s_synced, true);
    ESP_LOGW(TAG, "time synced via DEV SNTP: %" PRId64, (int64_t)tv->tv_sec);
}
#endif

void cam_time_init(void)
{
#if defined(CONFIG_CAM_DEV_SNTP_SERVER)
    /* Chuỗi rỗng = tắt. Cần gọi sau esp_netif_init(). */
    if (sizeof(CONFIG_CAM_DEV_SNTP_SERVER) > 1) {
        esp_sntp_config_t cfg = ESP_NETIF_SNTP_DEFAULT_CONFIG(CONFIG_CAM_DEV_SNTP_SERVER);
        cfg.sync_cb = on_sntp_sync;
        esp_netif_sntp_init(&cfg);
        ESP_LOGW(TAG, "DEV SNTP enabled (%s) — leave empty for demo/production", CONFIG_CAM_DEV_SNTP_SERVER);
    }
#endif
}

bool cam_time_set_unix(int64_t ts, const char *source)
{
    if (ts < TS_MIN) {
        ESP_LOGW(TAG, "ignore bogus time %" PRId64 " from %s", ts, source);
        return false;
    }
    struct timeval tv = {.tv_sec = (time_t)ts, .tv_usec = 0};
    settimeofday(&tv, NULL);
    if (!atomic_exchange(&s_synced, true)) {
        ESP_LOGI(TAG, "time synced from %s: %" PRId64, source, ts);
    }
    return true;
}

bool cam_time_is_synced(void)
{
    return atomic_load(&s_synced);
}

bool cam_time_now(int64_t *out)
{
    if (!atomic_load(&s_synced)) {
        return false;
    }
    *out = (int64_t)time(NULL);
    return true;
}
