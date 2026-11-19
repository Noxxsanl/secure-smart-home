#include "node_status_led.h"

#include <stdatomic.h>
#include <stdint.h>

#include "board_led.h"
#include "esp_log.h"
#include "esp_timer.h"
#include "freertos/FreeRTOS.h"
#include "freertos/task.h"

static const char *TAG = "node_led";

#define LED_PERIOD_MS 50
#define LED_TASK_STACK 2560
#define LED_TASK_PRIO 2
#define FLASH_MS 80
#define BLINK_FAST_MS 100   /* lỗi */
#define BLINK_MED_MS 250    /* đang dò Gateway */
#define BLINK_SLOW_MS 1000  /* chưa ghép nối */

typedef struct {
    uint8_t r, g, b;
} rgb_t;

static const rgb_t COLOR_OFF = {0, 0, 0};
static const rgb_t COLOR_BLUE = {0, 0, 255};
static const rgb_t COLOR_RED = {255, 0, 0};
static const rgb_t COLOR_YELLOW = {255, 150, 0};
static const rgb_t COLOR_GREEN = {0, 255, 0};
static const rgb_t COLOR_PURPLE = {170, 0, 255};
static const rgb_t COLOR_WHITE = {255, 255, 255};

static atomic_bool s_started;
static atomic_int s_link = NODE_LED_BOOT;
static atomic_bool s_busy;
static atomic_bool s_error;
static atomic_uint s_flash_until_ms;   /* so sánh kiểu tràn vòng (uint32 ms) */

static uint32_t now_ms(void)
{
    return (uint32_t)(esp_timer_get_time() / 1000);
}

static bool blink(uint32_t now, uint32_t half_period_ms)
{
    return (now / half_period_ms) % 2 == 0;
}

static rgb_t pick_color(uint32_t now)
{
    if ((int32_t)(atomic_load(&s_flash_until_ms) - now) > 0) {
        return COLOR_WHITE;
    }
    if (atomic_load(&s_error)) {
        return blink(now, BLINK_FAST_MS) ? COLOR_RED : COLOR_OFF;
    }
    if (atomic_load(&s_busy)) {
        return COLOR_PURPLE;
    }
    switch ((node_led_link_t)atomic_load(&s_link)) {
    case NODE_LED_UNPAIRED:
        return blink(now, BLINK_SLOW_MS) ? COLOR_RED : COLOR_OFF;
    case NODE_LED_SEARCHING:
        return blink(now, BLINK_MED_MS) ? COLOR_YELLOW : COLOR_OFF;
    case NODE_LED_ONLINE:
        return COLOR_GREEN;
    case NODE_LED_BOOT:
    default:
        return COLOR_BLUE;
    }
}

static void led_task(void *arg)
{
    (void)arg;
    rgb_t last = {1, 2, 3};   /* khác mọi màu thật: lần đầu luôn gửi */
    for (;;) {
        rgb_t c = pick_color(now_ms());
        if (c.r != last.r || c.g != last.g || c.b != last.b) {
            if (board_led_set(c.r, c.g, c.b) == ESP_OK) {
                last = c;
            }
        }
        vTaskDelay(pdMS_TO_TICKS(LED_PERIOD_MS));
    }
}

esp_err_t node_status_led_start(void)
{
    if (atomic_load(&s_started)) {
        return ESP_OK;
    }
    esp_err_t err = board_led_init();
    if (err != ESP_OK) {
        if (err != ESP_ERR_NOT_SUPPORTED) {
            ESP_LOGW(TAG, "status LED not available (%s): check GPIO in menuconfig (Node S3: LED debug)",
                     esp_err_to_name(err));
        }
        return err;
    }
    board_led_set(COLOR_BLUE.r, COLOR_BLUE.g, COLOR_BLUE.b);
    if (xTaskCreate(led_task, "status_led", LED_TASK_STACK, NULL, LED_TASK_PRIO, NULL) != pdPASS) {
        ESP_LOGW(TAG, "cannot start LED task (no memory)");
        return ESP_ERR_NO_MEM;
    }
    atomic_store(&s_started, true);
    return ESP_OK;
}

void node_status_led_set_link(node_led_link_t link)
{
    atomic_store(&s_link, (int)link);
}

void node_status_led_set_busy(bool busy)
{
    atomic_store(&s_busy, busy);
}

void node_status_led_set_error(bool error)
{
    atomic_store(&s_error, error);
}

void node_status_led_flash(void)
{
    atomic_store(&s_flash_until_ms, now_ms() + FLASH_MS);
}
