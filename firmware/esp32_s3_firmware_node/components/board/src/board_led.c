#include "board_led.h"

#include "drv_ws2812.h"
#include "esp_check.h"
#include "esp_log.h"
#include "sdkconfig.h"

static const char *TAG = "board_led";

static drv_ws2812_handle_t s_led;

esp_err_t board_led_init(void)
{
#if CONFIG_NODE_LED_ENABLE
    if (s_led != NULL) {
        return ESP_OK;
    }
    const drv_ws2812_config_t cfg = {.gpio = CONFIG_NODE_LED_GPIO, .led_count = 1};
    ESP_RETURN_ON_ERROR(drv_ws2812_init(&cfg, &s_led), TAG, "WS2812 on GPIO %d", CONFIG_NODE_LED_GPIO);
    return ESP_OK;
#else
    return ESP_ERR_NOT_SUPPORTED;
#endif
}

bool board_led_ready(void)
{
    return s_led != NULL;
}

esp_err_t board_led_set(uint8_t r, uint8_t g, uint8_t b)
{
    ESP_RETURN_ON_FALSE(s_led != NULL, ESP_ERR_INVALID_STATE, TAG, "LED not initialised");
#if CONFIG_NODE_LED_ENABLE
    const uint32_t pct = CONFIG_NODE_LED_BRIGHTNESS;
#else
    const uint32_t pct = 0;
#endif
    /* Làm tròn lên để màu tối (VD 10 % của 40) không tắt hẳn. */
    r = (uint8_t)((r * pct + 99) / 100);
    g = (uint8_t)((g * pct + 99) / 100);
    b = (uint8_t)((b * pct + 99) / 100);
    ESP_RETURN_ON_ERROR(drv_ws2812_set(s_led, 0, r, g, b), TAG, "set");
    return drv_ws2812_show(s_led);
}
