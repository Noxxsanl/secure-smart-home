#include "cam_pir.h"

#include "driver/gpio.h"
#include "esp_attr.h"
#include "esp_log.h"
#include "esp_timer.h"
#include "freertos/FreeRTOS.h"
#include "freertos/task.h"
#include "sdkconfig.h"

static const char *TAG = "cam_pir";

#define PIR_GPIO ((gpio_num_t)CONFIG_CAM_PIR_GPIO)

static TaskHandle_t s_task;
static cam_pir_motion_cb_t s_on_motion;

static void IRAM_ATTR pir_isr(void *arg)
{
    BaseType_t woken = pdFALSE;
    vTaskNotifyGiveFromISR(s_task, &woken);
    portYIELD_FROM_ISR(woken);
}

static void pir_task(void *arg)
{
    const int64_t warmup_us = (int64_t)CONFIG_CAM_PIR_WARMUP_S * 1000000;
    const int64_t cooldown_us = (int64_t)CONFIG_CAM_PIR_COOLDOWN_S * 1000000;
    int64_t last = -cooldown_us;

    for (;;) {
        ulTaskNotifyTake(pdTRUE, portMAX_DELAY);
        int64_t now = esp_timer_get_time();
        if (now < warmup_us || now - last < cooldown_us) {
            continue;
        }
        last = now;
        ESP_LOGI(TAG, "motion detected");
        if (s_on_motion) {
            s_on_motion();
        }
    }
}

esp_err_t cam_pir_start(cam_pir_motion_cb_t on_motion)
{
    s_on_motion = on_motion;
    if (xTaskCreatePinnedToCore(pir_task, "pir", 3072, NULL, 4, &s_task, 0) != pdPASS) {
        return ESP_ERR_NO_MEM;
    }

    const gpio_config_t io = {
        .pin_bit_mask = 1ULL << PIR_GPIO,
        .mode = GPIO_MODE_INPUT,
        .pull_up_en = GPIO_PULLUP_DISABLE,
        .pull_down_en = GPIO_PULLDOWN_ENABLE,   /* HC-SR501 kéo lên khi có chuyển động */
        .intr_type = GPIO_INTR_POSEDGE,
    };
    ESP_ERROR_CHECK(gpio_config(&io));

    /* Driver camera có thể đã cài ISR service — chấp nhận ESP_ERR_INVALID_STATE. */
    esp_err_t err = gpio_install_isr_service(ESP_INTR_FLAG_IRAM);
    if (err != ESP_OK && err != ESP_ERR_INVALID_STATE) {
        return err;
    }
    err = gpio_isr_handler_add(PIR_GPIO, pir_isr, NULL);
    if (err == ESP_OK) {
        ESP_LOGI(TAG, "PIR on GPIO%d (warm-up %d s, cooldown %d s)", CONFIG_CAM_PIR_GPIO, CONFIG_CAM_PIR_WARMUP_S,
                 CONFIG_CAM_PIR_COOLDOWN_S);
    }
    return err;
}
