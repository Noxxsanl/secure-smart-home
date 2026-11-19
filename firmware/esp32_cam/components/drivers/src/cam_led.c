#include "cam_led.h"

#include <stdatomic.h>

#include "driver/ledc.h"
#include "esp_check.h"
#include "esp_log.h"
#include "freertos/FreeRTOS.h"
#include "freertos/task.h"
#include "sdkconfig.h"

static const char *TAG = "cam_led";

#define LED_GPIO CONFIG_CAM_LED_GPIO
#define LED_MODE LEDC_LOW_SPEED_MODE
#define LED_TIMER LEDC_TIMER_1       /* TIMER_0 + CHANNEL_0: XCLK của camera */
#define LED_CHANNEL LEDC_CHANNEL_1
#define LED_PWM_HZ 5000
#define LED_RES LEDC_TIMER_10_BIT
#define LED_DUTY_MAX ((1u << 10) - 1)
#define LED_TASK_STACK 2048
#define LED_TASK_PRIO 1              /* thấp nhất trên IDLE: nháy lệch vài ms cũng không sao */

static uint32_t s_period_ms;
static uint32_t s_on_ms;
static uint32_t s_duty;
static atomic_bool s_started = false;
static atomic_bool s_paused = false;

static void set_duty(uint32_t duty)
{
    ledc_set_duty(LED_MODE, LED_CHANNEL, duty);
    ledc_update_duty(LED_MODE, LED_CHANNEL);
}

static void blink_task(void *arg)
{
    TickType_t last = xTaskGetTickCount();
    for (;;) {
        if (!atomic_load(&s_paused)) {
            set_duty(s_duty);
        }
        vTaskDelay(pdMS_TO_TICKS(s_on_ms));
        set_duty(0);
        xTaskDelayUntil(&last, pdMS_TO_TICKS(s_period_ms));   /* giữ đúng chu kỳ, không cộng dồn trễ */
    }
}

esp_err_t cam_led_blink_start(uint32_t period_ms, uint32_t on_ms, uint8_t brightness_pct)
{
    ESP_RETURN_ON_FALSE(period_ms >= 20 && on_ms >= 1 && on_ms < period_ms && brightness_pct >= 1 &&
                            brightness_pct <= 100,
                        ESP_ERR_INVALID_ARG, TAG, "need 1 <= on_ms < period_ms, period_ms >= 20, 1..100 %%");
    s_period_ms = period_ms;
    s_on_ms = on_ms;
    s_duty = LED_DUTY_MAX * brightness_pct / 100;

    const ledc_timer_config_t timer = {
        .speed_mode = LED_MODE,
        .duty_resolution = LED_RES,
        .timer_num = LED_TIMER,
        .freq_hz = LED_PWM_HZ,
        .clk_cfg = LEDC_USE_APB_CLK,   /* trùng nguồn clock XCLK camera chọn (APB) — tránh xung đột clock */
    };
    ESP_RETURN_ON_ERROR(ledc_timer_config(&timer), TAG, "LEDC timer");
    const ledc_channel_config_t channel = {
        .gpio_num = LED_GPIO,
        .speed_mode = LED_MODE,
        .channel = LED_CHANNEL,
        .timer_sel = LED_TIMER,
        .intr_type = LEDC_INTR_DISABLE,
        .duty = 0,
        .hpoint = 0,
    };
    ESP_RETURN_ON_ERROR(ledc_channel_config(&channel), TAG, "LEDC channel");

    if (xTaskCreate(blink_task, "led", LED_TASK_STACK, NULL, LED_TASK_PRIO, NULL) != pdPASS) {
        return ESP_ERR_NO_MEM;
    }
    atomic_store(&s_started, true);
    ESP_LOGI(TAG, "flash LED GPIO%d: on %u ms every %u ms, brightness %u%%", LED_GPIO, (unsigned)on_ms,
             (unsigned)period_ms, (unsigned)brightness_pct);
    return ESP_OK;
}

void cam_led_pause(bool pause)
{
    if (!atomic_load(&s_started)) {
        return;   /* nháy chưa chạy (tắt trong menuconfig hoặc init lỗi): không có gì để tạm dừng */
    }
    atomic_store(&s_paused, pause);
    if (pause) {
        /* Tắt ngay nếu đang trong 100 ms sáng. Nếu blink_task vừa kiểm cờ trước lúc này thì đèn sáng nốt
         * nhịp hiện tại rồi tắt (task luôn tắt ở cuối nhịp) — chấp nhận được. */
        set_duty(0);
    }
}
