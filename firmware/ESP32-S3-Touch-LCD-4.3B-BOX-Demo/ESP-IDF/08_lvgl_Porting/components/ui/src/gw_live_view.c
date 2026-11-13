#include "gw_live_view.h"

#include <stdatomic.h>
#include <string.h>

#include "esp_heap_caps.h"
#include "esp_log.h"
#include "esp_timer.h"
#include "freertos/FreeRTOS.h"
#include "freertos/task.h"
#include "gw_display.h"
#include "gw_jpeg.h"

static const char *TAG = "gw_live_view";

#define DECODE_TASK_STACK 6144
#define DECODE_TASK_PRIO 1             /* dưới task LVGL (2) */
#define DECODE_TASK_CORE 1             /* nhân 1 như LVGL; nhân 0 dành cho WiFi + đọc luồng camera */
#define DECODE_YIELD_MS 1              /* nhường IDLE1 sau mỗi khung — task watchdog canh IDLE của cả 2 nhân */
#define LOCK_MS 100                    /* không lấy kịp khoá LVGL → bỏ khung, không xếp hàng */
#define STATS_US (5 * 1000 * 1000LL)
#define FPS_WINDOW_US 1000000LL
#define FPS_STALE_US 2000000LL         /* ngừng nhận khung lâu hơn thế → đếm fps lại từ đầu */

typedef struct {
    const uint8_t *jpeg;
    size_t len;
    gw_live_release_t release;
    void *arg;
} job_t;

static gw_live_view_ops_t s_ops;
static TaskHandle_t s_task;
static portMUX_TYPE s_mux = portMUX_INITIALIZER_UNLOCKED;
static job_t s_pending;                /* ô chờ duy nhất, dưới s_mux */
static atomic_uint s_replaced;         /* khung bị thay trước khi giải nén (cửa sổ thống kê hiện tại) */
static atomic_uint s_submitted;

static uint16_t *s_buf[2];
static lv_img_dsc_t s_dsc[2];
static int s_front = -1;               /* bộ đệm LVGL đang vẽ, -1 = chưa có ảnh — chỉ task gw_decode đổi */
static uint16_t s_max_w, s_max_h;
static gw_jpeg_decoder_t *s_dec;

static job_t take_pending(void)
{
    job_t j;
    portENTER_CRITICAL(&s_mux);
    j = s_pending;
    s_pending = (job_t){0};
    portEXIT_CRITICAL(&s_mux);
    return j;
}

static void job_release(const job_t *j)
{
    if (j->release != NULL) {
        j->release(j->arg);
    }
}

esp_err_t gw_live_view_submit(const uint8_t *jpeg, size_t len, gw_live_release_t release, void *arg)
{
    if (s_task == NULL || jpeg == NULL || len == 0 || !s_ops.is_on()) {
        return ESP_ERR_INVALID_STATE;
    }
    const job_t nj = {.jpeg = jpeg, .len = len, .release = release, .arg = arg};
    job_t old;
    portENTER_CRITICAL(&s_mux);
    old = s_pending;
    s_pending = nj;
    portEXIT_CRITICAL(&s_mux);
    atomic_fetch_add(&s_submitted, 1);
    if (old.jpeg != NULL) {
        atomic_fetch_add(&s_replaced, 1);
        job_release(&old);   /* khung cũ chưa kịp giải nén: bỏ, giữ khung mới nhất */
    }
    xTaskNotifyGive(s_task);
    return ESP_OK;
}

void gw_live_view_flush(void)
{
    if (s_task == NULL) {
        return;
    }
    const job_t j = take_pending();
    if (j.jpeg != NULL) {
        job_release(&j);
    }
}

/* Giải nén vào bộ đệm sau, rồi đổi ảnh dưới khoá LVGL. */
static esp_err_t decode_and_show(const job_t *j)
{
    const int back = (s_front == 0) ? 1 : 0;
    uint16_t w = 0, h = 0;
    esp_err_t err = gw_jpeg_decode_fit(s_dec, j->jpeg, j->len, s_buf[back], s_max_w, s_max_h, &w, &h);
    if (err != ESP_OK) {
        return err;
    }
    lv_img_dsc_t *d = &s_dsc[back];
    memset(d, 0, sizeof(*d));
    d->header.cf = LV_IMG_CF_TRUE_COLOR;
    d->header.w = w;
    d->header.h = h;
    d->data_size = (uint32_t)w * h * sizeof(lv_color_t);
    d->data = (const uint8_t *)s_buf[back];

    if (!gw_display_lock(LOCK_MS)) {
        return ESP_ERR_TIMEOUT;
    }
    s_ops.present(d);
    s_front = back;
    gw_display_unlock();
    return ESP_OK;
}

static void decode_task(void *arg)
{
    int64_t stats_us = esp_timer_get_time();
    int64_t fps_us = 0, last_shown_us = 0;
    uint32_t fps_frames = 0, shown = 0, failed = 0, lock_timeouts = 0;
    uint64_t decode_sum_us = 0;
    uint32_t decode_max_ms = 0;
    uint16_t fps_x10 = 0;
    esp_err_t last_err = ESP_OK;

    for (;;) {
        ulTaskNotifyTake(pdTRUE, pdMS_TO_TICKS(1000));
        job_t j = take_pending();
        if (j.jpeg != NULL) {
            if (s_ops.is_on()) {
                const int64_t t0 = esp_timer_get_time();
                esp_err_t err = decode_and_show(&j);
                const int64_t now = esp_timer_get_time();
                if (err == ESP_OK) {
                    const uint32_t ms = (uint32_t)((now - t0) / 1000);
                    decode_sum_us += (uint64_t)(now - t0);
                    if (ms > decode_max_ms) {
                        decode_max_ms = ms;
                    }
                    shown++;
                    if (last_shown_us != 0 && now - last_shown_us > FPS_STALE_US) {
                        fps_us = 0;
                        fps_frames = 0;
                        fps_x10 = 0;
                    }
                    last_shown_us = now;
                    if (fps_us == 0) {
                        fps_us = now;
                    }
                    fps_frames++;
                    bool updated = false;
                    if (now - fps_us >= FPS_WINDOW_US) {
                        fps_x10 = (uint16_t)((int64_t)fps_frames * 10000000 / (now - fps_us));
                        fps_us = now;
                        fps_frames = 0;
                        updated = true;
                    }
                    s_ops.shown(fps_x10, updated);
                } else if (err == ESP_ERR_TIMEOUT) {
                    lock_timeouts++;
                } else {
                    failed++;
                    last_err = err;
                }
            }
            job_release(&j);
            vTaskDelay(pdMS_TO_TICKS(DECODE_YIELD_MS));
        }

        const int64_t now = esp_timer_get_time();
        if (now - stats_us >= STATS_US) {
            const int64_t span_ms = (now - stats_us) / 1000;
            const uint32_t submitted = atomic_exchange(&s_submitted, 0);
            const uint32_t replaced = atomic_exchange(&s_replaced, 0);
            if (submitted > 0 || shown > 0) {
                ESP_LOGI(TAG, "shown %u.%u fps, decode avg %u ms (max %u), submitted %u, dropped %u (replaced), failed %u, lvgl lock timeouts %u",
                         (unsigned)(shown * 10000 / span_ms / 10), (unsigned)(shown * 10000 / span_ms % 10),
                         shown ? (unsigned)(decode_sum_us / 1000 / shown) : 0u, (unsigned)decode_max_ms,
                         (unsigned)submitted, (unsigned)replaced, (unsigned)failed, (unsigned)lock_timeouts);
                if (failed > 0) {
                    ESP_LOGW(TAG, "%u frame(s) could not be decoded (last: %s)", (unsigned)failed,
                             esp_err_to_name(last_err));
                }
            }
            stats_us = now;
            shown = failed = lock_timeouts = 0;
            decode_sum_us = 0;
            decode_max_ms = 0;
        }
    }
}

esp_err_t gw_live_view_start(uint16_t max_w, uint16_t max_h, const gw_live_view_ops_t *ops)
{
    if (s_task != NULL) {
        return ESP_OK;
    }
    if (ops == NULL || ops->is_on == NULL || ops->present == NULL || ops->shown == NULL) {
        return ESP_ERR_INVALID_ARG;
    }
    s_ops = *ops;
    s_max_w = max_w;
    s_max_h = max_h;
    const size_t bytes = (size_t)max_w * max_h * sizeof(uint16_t);
    for (int i = 0; i < 2; i++) {
        s_buf[i] = heap_caps_aligned_alloc(64, bytes, MALLOC_CAP_SPIRAM | MALLOC_CAP_8BIT);
        if (s_buf[i] == NULL) {
            heap_caps_free(s_buf[0]);
            s_buf[0] = s_buf[1] = NULL;
            ESP_LOGE(TAG, "no PSRAM for %ux%u image buffers", max_w, max_h);
            return ESP_ERR_NO_MEM;
        }
    }
    s_dec = gw_jpeg_create();
    if (s_dec == NULL) {
        heap_caps_free(s_buf[0]);
        heap_caps_free(s_buf[1]);
        s_buf[0] = s_buf[1] = NULL;
        return ESP_ERR_NO_MEM;
    }
    s_front = -1;
    if (xTaskCreatePinnedToCore(decode_task, "gw_decode", DECODE_TASK_STACK, NULL, DECODE_TASK_PRIO, &s_task,
                                DECODE_TASK_CORE) != pdPASS) {
        gw_jpeg_destroy(s_dec);
        s_dec = NULL;
        heap_caps_free(s_buf[0]);
        heap_caps_free(s_buf[1]);
        s_buf[0] = s_buf[1] = NULL;
        return ESP_ERR_NO_MEM;
    }
    return ESP_OK;
}
