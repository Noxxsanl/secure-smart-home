#include "drv_stepper.h"

#include <stdatomic.h>
#include <stdlib.h>

#include "driver/gpio.h"
#include "esp_check.h"
#include "esp_log.h"
#include "esp_timer.h"
#include "freertos/FreeRTOS.h"
#include "freertos/semphr.h"

static const char *TAG = "drv_stepper";

#define STEPPER_DEFAULT_PERIOD_US 1500
#define STEPPER_MIN_PERIOD_US 500
#define STEPPER_SOFT_START_STEPS 32   /* bước đầu mỗi lần chạy: 1 bước / 2 chu kỳ */

/* Nửa bước, bit 0 = IN1 … bit 3 = IN4: 1 cuộn, 2 cuộn xen kẽ → 8 pha. */
static const uint8_t HALF_STEP[8] = {0x1, 0x3, 0x2, 0x6, 0x4, 0xC, 0x8, 0x9};

struct drv_stepper {
    int gpio[4];
    bool invert;
    uint32_t period_us;
    esp_timer_handle_t timer;
    /*
     * api_lock: bật/tắt esp_timer + s_timer_on. Hàm API giữ khi đổi đích / khởi động; callback chỉ THỬ lấy (không chờ)
     * khi cần dừng timer — lấy hụt thì thử lại ở chu kỳ sau, nên task esp_timer không bao giờ bị chặn.
     */
    SemaphoreHandle_t api_lock;
    atomic_bool timer_on;
    portMUX_TYPE mux;   /* pos, target, phase, stop_req, đếm khởi động mềm */
    int32_t pos;
    int32_t target;
    uint8_t phase;
    bool stop_req;
    uint32_t steps_done;
    uint32_t ticks;
    drv_stepper_done_cb_t cb;
    void *cb_ctx;
};

static void write_coils(const struct drv_stepper *h, uint8_t mask)
{
    for (int i = 0; i < 4; i++) {
        gpio_set_level(h->gpio[i], (mask >> i) & 1u);
    }
}

/* Gọi khi đã giữ api_lock. */
static void halt_locked(struct drv_stepper *h)
{
    esp_timer_stop(h->timer);   /* dừng được cả từ trong callback của chính nó */
    atomic_store(&h->timer_on, false);
    write_coils(h, 0);
}

static void on_tick(void *arg)
{
    struct drv_stepper *h = arg;
    bool step = false;
    bool finish = false;
    uint8_t mask = 0;

    taskENTER_CRITICAL(&h->mux);
    h->ticks++;
    if (h->stop_req || h->pos == h->target) {
        finish = true;
    } else if (h->steps_done >= STEPPER_SOFT_START_STEPS || (h->ticks & 1u) == 0) {
        int dir = h->target > h->pos ? 1 : -1;
        h->pos += dir;
        int phase_dir = h->invert ? -dir : dir;
        h->phase = (uint8_t)((h->phase + phase_dir) & 7);
        mask = HALF_STEP[h->phase];
        h->steps_done++;
        step = true;
    }
    taskEXIT_CRITICAL(&h->mux);

    if (step) {
        write_coils(h, mask);
        return;
    }
    if (!finish || xSemaphoreTake(h->api_lock, 0) != pdTRUE) {
        return;   /* khởi động mềm bỏ chu kỳ này, hoặc API đang đổi đích: xét lại ở chu kỳ sau */
    }
    bool reached = false;
    int32_t pos;
    taskENTER_CRITICAL(&h->mux);
    finish = h->stop_req || h->pos == h->target;   /* đích có thể vừa đổi trong lúc chờ khoá */
    if (finish) {
        reached = !h->stop_req;
        h->stop_req = false;
        h->target = h->pos;
    }
    pos = h->pos;
    taskEXIT_CRITICAL(&h->mux);
    if (finish) {
        halt_locked(h);
    }
    xSemaphoreGive(h->api_lock);
    if (finish && h->cb != NULL) {
        h->cb(pos, reached, h->cb_ctx);
    }
}

esp_err_t drv_stepper_init(const drv_stepper_config_t *cfg, drv_stepper_handle_t *out)
{
    ESP_RETURN_ON_FALSE(cfg && out, ESP_ERR_INVALID_ARG, TAG, "null arg");
    uint64_t pin_mask = 0;
    for (int i = 0; i < 4; i++) {
        ESP_RETURN_ON_FALSE(GPIO_IS_VALID_OUTPUT_GPIO(cfg->gpio[i]), ESP_ERR_INVALID_ARG, TAG, "IN%d: invalid gpio %d",
                            i + 1, cfg->gpio[i]);
        ESP_RETURN_ON_FALSE((pin_mask & (1ULL << cfg->gpio[i])) == 0, ESP_ERR_INVALID_ARG, TAG, "IN%d: gpio %d reused",
                            i + 1, cfg->gpio[i]);
        pin_mask |= 1ULL << cfg->gpio[i];
    }
    uint32_t period = cfg->step_period_us ? cfg->step_period_us : STEPPER_DEFAULT_PERIOD_US;
    ESP_RETURN_ON_FALSE(period >= STEPPER_MIN_PERIOD_US, ESP_ERR_INVALID_ARG, TAG, "step period < %d us",
                        STEPPER_MIN_PERIOD_US);

    struct drv_stepper *h = calloc(1, sizeof(*h));
    ESP_RETURN_ON_FALSE(h, ESP_ERR_NO_MEM, TAG, "no mem");
    for (int i = 0; i < 4; i++) {
        h->gpio[i] = cfg->gpio[i];
    }
    h->invert = cfg->invert_dir;
    h->period_us = period;
    portMUX_INITIALIZE(&h->mux);
    atomic_init(&h->timer_on, false);

    esp_err_t ret = ESP_OK;
    h->api_lock = xSemaphoreCreateMutex();
    ESP_GOTO_ON_FALSE(h->api_lock, ESP_ERR_NO_MEM, err, TAG, "no mem");

    /* Mức thấp trước khi bật output: cuộn không cấp điện lúc khởi động. */
    write_coils(h, 0);
    gpio_config_t io = {
        .pin_bit_mask = pin_mask,
        .mode = GPIO_MODE_OUTPUT,
        .pull_up_en = GPIO_PULLUP_DISABLE,
        .pull_down_en = GPIO_PULLDOWN_DISABLE,
        .intr_type = GPIO_INTR_DISABLE,
    };
    ESP_GOTO_ON_ERROR(gpio_config(&io), err, TAG, "gpio config failed");
    write_coils(h, 0);

    const esp_timer_create_args_t targs = {
        .callback = on_tick,
        .arg = h,
        .dispatch_method = ESP_TIMER_TASK,
        .name = "stepper",
        .skip_unhandled_events = true,   /* task esp_timer bị trễ thì bỏ chu kỳ lỡ, không dồn bước (động cơ trượt) */
    };
    ESP_GOTO_ON_ERROR(esp_timer_create(&targs, &h->timer), err, TAG, "esp_timer_create failed");

    *out = h;
    ESP_LOGI(TAG, "ULN2003 on GPIO %d/%d/%d/%d, %u us per half-step", h->gpio[0], h->gpio[1], h->gpio[2], h->gpio[3],
             (unsigned)period);
    return ESP_OK;

err:
    if (h->api_lock) {
        vSemaphoreDelete(h->api_lock);
    }
    free(h);
    return ret;
}

void drv_stepper_set_done_cb(drv_stepper_handle_t h, drv_stepper_done_cb_t cb, void *ctx)
{
    if (h == NULL) {
        return;
    }
    xSemaphoreTake(h->api_lock, portMAX_DELAY);
    h->cb = cb;
    h->cb_ctx = ctx;
    xSemaphoreGive(h->api_lock);
}

esp_err_t drv_stepper_move_to(drv_stepper_handle_t h, int32_t target)
{
    ESP_RETURN_ON_FALSE(h, ESP_ERR_INVALID_ARG, TAG, "null arg");
    esp_err_t err = ESP_OK;
    xSemaphoreTake(h->api_lock, portMAX_DELAY);
    bool start = false;
    uint8_t mask = 0;
    taskENTER_CRITICAL(&h->mux);
    int old_dir = (h->target > h->pos) - (h->target < h->pos);
    int new_dir = (target > h->pos) - (target < h->pos);
    if (old_dir != 0 && new_dir != 0 && old_dir != new_dir) {
        /* Đảo chiều khi đang chạy: chạy lại đoạn khởi động mềm, đỡ trượt bước (vòng hở, trượt là lệch vị trí). */
        h->steps_done = 0;
        h->ticks = 0;
    }
    h->target = target;
    h->stop_req = false;
    if (!atomic_load(&h->timer_on) && h->pos != target) {
        start = true;
        h->steps_done = 0;
        h->ticks = 0;
        mask = HALF_STEP[h->phase];
    }
    taskEXIT_CRITICAL(&h->mux);
    if (start) {
        write_coils(h, mask);   /* giữ đúng pha đang đứng trước bước đầu: trục không giật */
        err = esp_timer_start_periodic(h->timer, h->period_us);
        if (err == ESP_OK) {
            atomic_store(&h->timer_on, true);
        } else {
            write_coils(h, 0);
            ESP_LOGE(TAG, "esp_timer_start_periodic: %s", esp_err_to_name(err));
        }
    }
    xSemaphoreGive(h->api_lock);
    return err;
}

esp_err_t drv_stepper_stop(drv_stepper_handle_t h)
{
    ESP_RETURN_ON_FALSE(h, ESP_ERR_INVALID_ARG, TAG, "null arg");
    xSemaphoreTake(h->api_lock, portMAX_DELAY);
    if (atomic_load(&h->timer_on)) {
        taskENTER_CRITICAL(&h->mux);
        h->stop_req = true;
        taskEXIT_CRITICAL(&h->mux);
    }
    xSemaphoreGive(h->api_lock);
    return ESP_OK;
}

esp_err_t drv_stepper_set_position(drv_stepper_handle_t h, int32_t position)
{
    ESP_RETURN_ON_FALSE(h, ESP_ERR_INVALID_ARG, TAG, "null arg");
    esp_err_t err = ESP_OK;
    xSemaphoreTake(h->api_lock, portMAX_DELAY);
    if (atomic_load(&h->timer_on)) {
        err = ESP_ERR_INVALID_STATE;
    } else {
        taskENTER_CRITICAL(&h->mux);
        h->pos = position;
        h->target = position;
        taskEXIT_CRITICAL(&h->mux);
    }
    xSemaphoreGive(h->api_lock);
    return err;
}

int32_t drv_stepper_position(drv_stepper_handle_t h)
{
    if (h == NULL) {
        return 0;
    }
    taskENTER_CRITICAL(&h->mux);
    int32_t pos = h->pos;
    taskEXIT_CRITICAL(&h->mux);
    return pos;
}

int32_t drv_stepper_target(drv_stepper_handle_t h)
{
    if (h == NULL) {
        return 0;
    }
    taskENTER_CRITICAL(&h->mux);
    int32_t target = h->target;
    taskEXIT_CRITICAL(&h->mux);
    return target;
}

bool drv_stepper_is_moving(drv_stepper_handle_t h)
{
    return h != NULL && atomic_load(&h->timer_on);
}

esp_err_t drv_stepper_del(drv_stepper_handle_t h)
{
    if (h == NULL) {
        return ESP_ERR_INVALID_ARG;
    }
    xSemaphoreTake(h->api_lock, portMAX_DELAY);
    halt_locked(h);
    xSemaphoreGive(h->api_lock);
    esp_timer_delete(h->timer);
    vSemaphoreDelete(h->api_lock);
    free(h);
    return ESP_OK;
}
