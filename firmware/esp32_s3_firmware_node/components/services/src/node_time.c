#include "node_time.h"

#include <inttypes.h>
#include <stdatomic.h>
#include <stdlib.h>
#include <sys/time.h>
#include <time.h>

#include "esp_log.h"

static const char *TAG = "node_time";

#define TS_MIN INT64_C(1700000000)   /* 2023-11-14 */
#define TS_MAX INT64_C(4102444800)   /* 2100-01-01 */
#define TS_JUMP_WARN_S 60

static atomic_bool s_synced = false;

bool node_time_set_unix(int64_t ts, const char *source)
{
    if (ts < TS_MIN || ts > TS_MAX) {
        ESP_LOGW(TAG, "ignore bogus time %" PRId64 " from %s", ts, source);
        return false;
    }
    bool was_synced = atomic_load(&s_synced);
    if (was_synced) {
        int64_t drift = ts - (int64_t)time(NULL);
        if (llabs(drift) > TS_JUMP_WARN_S) {
            ESP_LOGW(TAG, "clock jump %" PRId64 " s from %s", drift, source);
        }
    }
    struct timeval tv = {.tv_sec = (time_t)ts, .tv_usec = 0};
    settimeofday(&tv, NULL);
    atomic_store(&s_synced, true);
    if (!was_synced) {
        ESP_LOGI(TAG, "time synced from %s: %" PRId64, source, ts);
    }
    return true;
}

bool node_time_is_synced(void)
{
    return atomic_load(&s_synced);
}

bool node_time_now(int64_t *out)
{
    if (out == NULL || !atomic_load(&s_synced)) {
        return false;
    }
    *out = (int64_t)time(NULL);
    return true;
}
