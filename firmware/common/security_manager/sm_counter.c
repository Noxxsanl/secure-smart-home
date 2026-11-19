#include "sm_counter.h"

#include <inttypes.h>
#include <stdbool.h>

#include "esp_check.h"
#include "esp_log.h"
#include "freertos/FreeRTOS.h"
#include "freertos/semphr.h"
#include "nvs.h"

static const char *TAG = "sm_counter";

#define NS "sec"
#define KEY_FLOOR "ctr_floor"
/* Đặt trước 10 phút → ~6 lần ghi NVS mỗi giờ. Mỗi lần khởi động lại, ctr có thể vượt giờ thật tối đa bằng khoảng này
 * (và tự hết khi giờ thật đuổi kịp); backend chỉ nhận ctr ≤ giờ + 1 ngày, nên khoảng nhỏ chịu được ~140 lần khởi động
 * lại liên tiếp trong 1 ngày (khoảng 1 giờ thì chỉ ~24 lần). */
#define RESERVE_MS (10LL * 60 * 1000)
/* Backend chấp nhận ctr ≤ giờ + 24 h; ctr vượt giờ + 25 h vốn đã vô dụng nên coi là sàn hỏng do giờ sai. */
#define SM_COUNTER_MAX_AHEAD_MS (25LL * 60 * 60 * 1000)
#define CTR_MAX INT64_C(9007199254740991)  /* 2^53 − 1: backend (JS) và cJSON (double) biểu diễn chính xác */

static portMUX_TYPE s_init_mux = portMUX_INITIALIZER_UNLOCKED;
static StaticSemaphore_t s_lock_buf;
static SemaphoreHandle_t s_lock;
static bool s_loaded;
static int64_t s_last;    /* ctr đã dùng gần nhất */
static int64_t s_floor;   /* mức đã ghi NVS: mọi ctr đã dùng đều < s_floor */

static void ensure_lock(void)
{
    taskENTER_CRITICAL(&s_init_mux);
    if (s_lock == NULL) {
        s_lock = xSemaphoreCreateMutexStatic(&s_lock_buf);
    }
    taskEXIT_CRITICAL(&s_init_mux);
}

static void load_floor(void)
{
    nvs_handle_t h;
    uint64_t v = 0;
    if (nvs_open(NS, NVS_READONLY, &h) == ESP_OK) {
        if (nvs_get_u64(h, KEY_FLOOR, &v) != ESP_OK) {
            v = 0;
        }
        nvs_close(h);
    }
    s_floor = (v > (uint64_t)CTR_MAX) ? CTR_MAX : (int64_t)v;
    s_last = s_floor;   /* sau khởi động lại: mọi ctr cũ < floor */
    s_loaded = true;
}

static esp_err_t save_floor(int64_t floor)
{
    nvs_handle_t h;
    esp_err_t err = nvs_open(NS, NVS_READWRITE, &h);
    if (err != ESP_OK) {
        return err;
    }
    err = nvs_set_u64(h, KEY_FLOOR, (uint64_t)floor);
    if (err == ESP_OK) {
        err = nvs_commit(h);
    }
    nvs_close(h);
    return err;
}

esp_err_t sm_counter_next(int64_t now_unix, int64_t *out)
{
    ESP_RETURN_ON_FALSE(out != NULL && now_unix > 0, ESP_ERR_INVALID_ARG, TAG, "bad arg");
    ensure_lock();
    xSemaphoreTake(s_lock, portMAX_DELAY);
    if (!s_loaded) {
        load_floor();
    }
    const int64_t now_ms = now_unix * 1000;
    if (s_last > now_ms + SM_COUNTER_MAX_AHEAD_MS) {
        /* Sàn cũ do giờ sai (VD NTP bị đẩy về tương lai) — ctr vượt ngưỡng này backend đã từ chối nên vô dụng.
         * Đặt lại theo giờ hiện tại; sàn NVS được ghi lại ngay bên dưới (s_floor lớn hơn mức hợp lệ). */
        ESP_LOGW(TAG, "counter was %" PRId64 " ms ahead of clock, reseeding from current time", s_last - now_ms);
        s_last = now_ms - 1;
    }
    int64_t next = s_last + 1;
    if (now_ms > next) {
        next = now_ms;
    }
    esp_err_t err = ESP_OK;
    if (next >= CTR_MAX) {
        err = ESP_ERR_INVALID_STATE;   /* không thể xảy ra với giờ thật — chặn cho chắc */
    } else if (next >= s_floor || s_floor > next + RESERVE_MS + SM_COUNTER_MAX_AHEAD_MS) {
        /* Nhánh thứ hai: sàn NVS đang cao bất thường (vừa reseed) → hạ xuống; nếu ghi lỗi thì thử lại lần gọi sau. */
        const int64_t floor = next + RESERVE_MS;
        esp_err_t save = save_floor(floor);
        if (save == ESP_OK) {
            s_floor = floor;
        } else {
            /* Vẫn gửi được (ctr vẫn tăng trong lần chạy này); qua khởi động lại thì ctr bám theo giờ */
            ESP_LOGW(TAG, "cannot persist counter floor: %s", esp_err_to_name(save));
        }
    }
    if (err == ESP_OK) {
        s_last = next;
        *out = next;
    }
    xSemaphoreGive(s_lock);
    return err;
}
