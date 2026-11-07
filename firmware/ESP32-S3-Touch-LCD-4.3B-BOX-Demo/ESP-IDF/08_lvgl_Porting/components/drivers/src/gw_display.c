#include "gw_display.h"

#include "esp_check.h"
#include "gw_i2c.h"
#include "lvgl_port.h"   /* src/lcd — ví dụ Waveshare; có CONFIG_EXAMPLE_LCD_TOUCH_CONTROLLER_GT911 */

static const char *TAG = "gw_display";

/*
 * Hàm của ví dụ Waveshare (src/lcd/waveshare_rgb_lcd_port.c, giữ nguyên tên kể cả lỗi chính tả "wavesahre").
 * Không include waveshare_rgb_lcd_port.h: header đó định nghĩa biến static TAG và kéo theo lv_demos.h.
 */
esp_err_t waveshare_esp32_s3_rgb_lcd_init(void);
esp_err_t wavesahre_rgb_lcd_bl_on(void);
esp_err_t wavesahre_rgb_lcd_bl_off(void);

esp_err_t gw_display_init(void)
{
#if CONFIG_EXAMPLE_LCD_TOUCH_CONTROLLER_GT911
    /* Ví dụ tự cài bus I2C khi khởi tạo cảm ứng — cài trước sẽ lỗi "driver install error". */
    ESP_RETURN_ON_ERROR(waveshare_esp32_s3_rgb_lcd_init(), TAG, "LCD init");
    gw_i2c_bus_mark_installed();
#else
    /* Tắt cảm ứng thì ví dụ không cài I2C, nhưng đèn nền (CH422G) và RTC vẫn cần bus. */
    ESP_RETURN_ON_ERROR(gw_i2c_bus_init(), TAG, "I2C bus");
    ESP_RETURN_ON_ERROR(waveshare_esp32_s3_rgb_lcd_init(), TAG, "LCD init");
#endif
    ESP_LOGI(TAG, "LCD %dx%d ready, touch %s", LVGL_PORT_H_RES, LVGL_PORT_V_RES,
             CONFIG_EXAMPLE_LCD_TOUCH_CONTROLLER_GT911 ? "on" : "off");
    return ESP_OK;
}

bool gw_display_lock(int timeout_ms)
{
    return lvgl_port_lock(timeout_ms);
}

void gw_display_unlock(void)
{
    lvgl_port_unlock();
}

esp_err_t gw_display_backlight(bool on)
{
    return on ? wavesahre_rgb_lcd_bl_on() : wavesahre_rgb_lcd_bl_off();
}
