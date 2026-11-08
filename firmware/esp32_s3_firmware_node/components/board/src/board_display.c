#include "board_display.h"

#include "drv_bus.h"
#include "drv_display.h"
#include "drv_ili9488.h"
#include "drv_xpt2046.h"
#include "esp_check.h"
#include "esp_log.h"
#include "sdkconfig.h"

static const char *TAG = "board_display";

#define LCD_SPI_HOST SPI2_HOST
#define LCD_BL_LEDC_TIMER 0
#define LCD_BL_LEDC_CHANNEL 0

#if CONFIG_NODE_LCD_ROTATION_90
#define LCD_ROTATION DRV_ILI9488_ROT_90
#elif CONFIG_NODE_LCD_ROTATION_180
#define LCD_ROTATION DRV_ILI9488_ROT_180
#elif CONFIG_NODE_LCD_ROTATION_270
#define LCD_ROTATION DRV_ILI9488_ROT_270
#else
#define LCD_ROTATION DRV_ILI9488_ROT_0
#endif

static drv_ili9488_handle_t s_lcd;
static bool s_touch_on;

#if CONFIG_NODE_TOUCH_ENABLE
static esp_err_t touch_init(int width, int height)
{
    drv_xpt2046_config_t tc = {
        .host = LCD_SPI_HOST,
        .cs_gpio = CONFIG_NODE_TOUCH_PIN_CS,
        .irq_gpio = CONFIG_NODE_TOUCH_PIN_IRQ,
        .width = width,
        .height = height,
#if CONFIG_NODE_TOUCH_SWAP_XY
        .swap_xy = true,
#endif
        .raw_left = CONFIG_NODE_TOUCH_RAW_LEFT,
        .raw_right = CONFIG_NODE_TOUCH_RAW_RIGHT,
        .raw_top = CONFIG_NODE_TOUCH_RAW_TOP,
        .raw_bottom = CONFIG_NODE_TOUCH_RAW_BOTTOM,
        .z_threshold = CONFIG_NODE_TOUCH_Z_THRESHOLD,
#if CONFIG_NODE_TOUCH_LOG_RAW
        .log_raw = true,
#endif
    };
    ESP_RETURN_ON_FALSE(CONFIG_NODE_LCD_PIN_MISO >= 0, ESP_ERR_INVALID_ARG, TAG, "touch needs MISO (T_DO) pin");
    drv_xpt2046_handle_t tp;
    ESP_RETURN_ON_ERROR(drv_xpt2046_init(&tc, &tp), TAG, "XPT2046");
    esp_err_t err = drv_display_add_touch(tp, NULL);
    if (err != ESP_OK) {
        drv_xpt2046_del(tp);
    }
    return err;
}
#endif

esp_err_t board_display_init(void)
{
    ESP_RETURN_ON_FALSE(s_lcd == NULL, ESP_ERR_INVALID_STATE, TAG, "already initialised");

    drv_spi_bus_config_t bus = {
        .host = LCD_SPI_HOST,
        .sclk_gpio = CONFIG_NODE_LCD_PIN_SCLK,
        .mosi_gpio = CONFIG_NODE_LCD_PIN_MOSI,
        .miso_gpio = CONFIG_NODE_LCD_PIN_MISO,
    };
    esp_err_t err = drv_spi_bus_init(&bus);
    ESP_RETURN_ON_FALSE(err == ESP_OK || err == ESP_ERR_INVALID_STATE, err, TAG, "SPI bus");

    drv_ili9488_config_t lc = {
        .host = LCD_SPI_HOST,
        .cs_gpio = CONFIG_NODE_LCD_PIN_CS,
        .dc_gpio = CONFIG_NODE_LCD_PIN_DC,
        .rst_gpio = CONFIG_NODE_LCD_PIN_RST,
        .bl_gpio = CONFIG_NODE_LCD_PIN_BL,
        .bl_ledc_timer = LCD_BL_LEDC_TIMER,
        .bl_ledc_channel = LCD_BL_LEDC_CHANNEL,
        .pclk_hz = CONFIG_NODE_LCD_PCLK_MHZ * 1000 * 1000,
#if CONFIG_NODE_LCD_BGR
        .bgr = true,
#endif
#if CONFIG_NODE_LCD_INVERT_COLOR
        .invert_color = true,
#endif
    };
    drv_ili9488_handle_t lcd;
    ESP_RETURN_ON_ERROR(drv_ili9488_init(&lc, &lcd), TAG, "ILI9488");
    err = drv_ili9488_set_rotation(lcd, LCD_ROTATION);
    if (err == ESP_OK) {
        err = drv_display_init(lcd, NULL, NULL);   /* lấy kích thước sau khi xoay */
    }
    if (err != ESP_OK) {
        drv_ili9488_del(lcd);
        ESP_LOGE(TAG, "LVGL init failed: %s", esp_err_to_name(err));
        return err;
    }
    s_lcd = lcd;

    int width = 0;
    int height = 0;
    drv_ili9488_get_size(lcd, &width, &height);
#if CONFIG_NODE_TOUCH_ENABLE
    err = touch_init(width, height);
    s_touch_on = (err == ESP_OK);
    if (!s_touch_on) {
        ESP_LOGW(TAG, "touch disabled: %s", esp_err_to_name(err));
    }
#endif
    ESP_LOGI(TAG, "display %dx%d ready, touch %s", width, height, s_touch_on ? "on" : "off");
    return ESP_OK;
}

esp_err_t board_display_backlight(uint8_t percent)
{
    ESP_RETURN_ON_FALSE(s_lcd, ESP_ERR_INVALID_STATE, TAG, "board_display_init first");
    return drv_ili9488_set_backlight(s_lcd, percent);
}

esp_err_t board_display_backlight_on(void)
{
    return board_display_backlight(CONFIG_NODE_LCD_BACKLIGHT_PERCENT);
}

bool board_display_touch_enabled(void)
{
    return s_touch_on;
}
