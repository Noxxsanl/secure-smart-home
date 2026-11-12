#include "drv_display.h"

#include "esp_check.h"
#include "esp_heap_caps.h"
#include "esp_log.h"
#include "esp_timer.h"
#include "freertos/FreeRTOS.h"
#include "freertos/semphr.h"
#include "freertos/task.h"

#if LV_COLOR_DEPTH != 16 || LV_COLOR_16_SWAP
#error "drv_display cần LV_COLOR_DEPTH 16 và tắt LV_COLOR_16_SWAP: drv_ili9488 nhận RGB565 theo thứ tự byte của CPU"
#endif

static const char *TAG = "drv_display";

#define TICK_PERIOD_MS 2
#define TASK_MIN_DELAY_MS 5     /* nhường CPU cho task khác cùng nhân dù LVGL còn việc */
#define TASK_MAX_DELAY_MS 500

static SemaphoreHandle_t s_lock;
static drv_ili9488_handle_t s_lcd;   /* để chờ LCD rảnh trước khi đọc cảm ứng (chung bus SPI) */
static lv_disp_draw_buf_t s_draw_buf;   /* LVGL giữ con trỏ tới các biến này suốt đời màn hình */
static lv_disp_drv_t s_disp_drv;
static lv_indev_drv_t s_touch_drv;
static lv_indev_t *s_touch;

static void tick_cb(void *arg)
{
    (void)arg;
    lv_tick_inc(TICK_PERIOD_MS);
}

static void flush_cb(lv_disp_drv_t *drv, const lv_area_t *area, lv_color_t *color_map)
{
    esp_lcd_panel_handle_t panel = drv->user_data;
    esp_err_t err = esp_lcd_panel_draw_bitmap(panel, area->x1, area->y1, area->x2 + 1, area->y2 + 1, color_map);
    if (err != ESP_OK) {
        ESP_LOGW(TAG, "flush failed: %s", esp_err_to_name(err));
    }
    /*
     * drv_ili9488 đổi xong cả vùng sang bộ đệm DMA riêng của nó trước khi draw_bitmap trả về, nên bộ đệm LVGL
     * rảnh ngay — báo xong ở đây, không chờ ngắt "truyền xong" của SPI (ngắt đó đến theo từng khúc, không theo vùng).
     */
    lv_disp_flush_ready(drv);
}

/*
 * Chạy trong task LVGL (đang giữ khoá), nối tiếp với flush. flush_cb trả về khi các khúc màu còn đang truyền DMA,
 * nên chờ LCD rảnh trước khi cảm ứng đọc bằng polling trên cùng bus SPI.
 */
static void touch_read_cb(lv_indev_drv_t *drv, lv_indev_data_t *data)
{
    int x = 0;
    int y = 0;
    bool pressed = false;
    drv_ili9488_wait_idle(s_lcd);
    if (drv_xpt2046_read(drv->user_data, &x, &y, &pressed) == ESP_OK && pressed) {
        data->point.x = (lv_coord_t)x;
        data->point.y = (lv_coord_t)y;
        data->state = LV_INDEV_STATE_PRESSED;
    } else {
        data->state = LV_INDEV_STATE_RELEASED;   /* LVGL giữ điểm cuối cho sự kiện thả tay */
    }
}

static void lvgl_task(void *arg)
{
    (void)arg;
    for (;;) {
        uint32_t delay_ms = TASK_MAX_DELAY_MS;
        if (drv_display_lock(-1)) {
            delay_ms = lv_timer_handler();
            drv_display_unlock();
        }
        if (delay_ms < TASK_MIN_DELAY_MS) {
            delay_ms = TASK_MIN_DELAY_MS;
        } else if (delay_ms > TASK_MAX_DELAY_MS) {
            delay_ms = TASK_MAX_DELAY_MS;
        }
        vTaskDelay(pdMS_TO_TICKS(delay_ms));
    }
}

bool drv_display_lock(int timeout_ms)
{
    if (s_lock == NULL) {
        return false;
    }
    TickType_t ticks = timeout_ms < 0 ? portMAX_DELAY : pdMS_TO_TICKS(timeout_ms);
    return xSemaphoreTakeRecursive(s_lock, ticks) == pdTRUE;
}

void drv_display_unlock(void)
{
    if (s_lock != NULL) {
        xSemaphoreGiveRecursive(s_lock);
    }
}

esp_err_t drv_display_add_touch(drv_xpt2046_handle_t touch, lv_indev_t **out_indev)
{
    ESP_RETURN_ON_FALSE(touch, ESP_ERR_INVALID_ARG, TAG, "null touch");
    ESP_RETURN_ON_FALSE(drv_display_lock(-1), ESP_ERR_INVALID_STATE, TAG, "drv_display_init first");
    esp_err_t ret = ESP_OK;
    if (s_touch != NULL) {
        ret = ESP_ERR_INVALID_STATE;
    } else {
        lv_indev_drv_init(&s_touch_drv);
        s_touch_drv.type = LV_INDEV_TYPE_POINTER;
        s_touch_drv.read_cb = touch_read_cb;
        s_touch_drv.user_data = touch;
        s_touch = lv_indev_drv_register(&s_touch_drv);
        if (s_touch == NULL) {
            ret = ESP_ERR_NO_MEM;
        }
    }
    drv_display_unlock();
    ESP_RETURN_ON_ERROR(ret, TAG, "register touch failed");
    if (out_indev) {
        *out_indev = s_touch;
    }
    return ESP_OK;
}

esp_err_t drv_display_init(drv_ili9488_handle_t lcd, const drv_display_config_t *cfg, lv_disp_t **out_disp)
{
    ESP_RETURN_ON_FALSE(lcd, ESP_ERR_INVALID_ARG, TAG, "null lcd");
    ESP_RETURN_ON_FALSE(s_lock == NULL, ESP_ERR_INVALID_STATE, TAG, "already initialised");
    const drv_display_config_t def = DRV_DISPLAY_CONFIG_DEFAULT();
    if (cfg == NULL) {
        cfg = &def;
    }
    ESP_RETURN_ON_FALSE(cfg->buf_lines > 0 && cfg->task_stack >= 2048 && cfg->task_core >= -1 &&
                            cfg->task_core < portNUM_PROCESSORS,
                        ESP_ERR_INVALID_ARG, TAG, "bad config");

    int width = 0;
    int height = 0;
    drv_ili9488_get_size(lcd, &width, &height);
    ESP_RETURN_ON_FALSE(width > 0 && height > 0, ESP_ERR_INVALID_STATE, TAG, "panel size unknown");
    int lines = cfg->buf_lines < height ? cfg->buf_lines : height;
    size_t buf_px = (size_t)width * (size_t)lines;
    uint32_t caps = cfg->buf_psram ? MALLOC_CAP_SPIRAM : (MALLOC_CAP_INTERNAL | MALLOC_CAP_8BIT);

    esp_err_t ret = ESP_OK;
    esp_timer_handle_t tick_timer = NULL;
    lv_disp_t *disp = NULL;
    lv_color_t *buf = heap_caps_malloc(buf_px * sizeof(lv_color_t), caps);
    ESP_RETURN_ON_FALSE(buf, ESP_ERR_NO_MEM, TAG, "no mem for %u px draw buffer", (unsigned)buf_px);

    s_lock = xSemaphoreCreateRecursiveMutex();
    ESP_GOTO_ON_FALSE(s_lock, ESP_ERR_NO_MEM, err, TAG, "no mem for lock");

    const esp_timer_create_args_t tick_args = {
        .callback = tick_cb,
        .name = "lv_tick",
    };
    ESP_GOTO_ON_ERROR(esp_timer_create(&tick_args, &tick_timer), err, TAG, "tick timer");

    lv_init();
    lv_disp_draw_buf_init(&s_draw_buf, buf, NULL, (uint32_t)buf_px);
    lv_disp_drv_init(&s_disp_drv);
    s_disp_drv.hor_res = (lv_coord_t)width;
    s_disp_drv.ver_res = (lv_coord_t)height;
    s_disp_drv.flush_cb = flush_cb;
    s_disp_drv.draw_buf = &s_draw_buf;
    s_disp_drv.user_data = drv_ili9488_panel(lcd);
    s_lcd = lcd;
    disp = lv_disp_drv_register(&s_disp_drv);
    ESP_GOTO_ON_FALSE(disp, ESP_ERR_NO_MEM, err, TAG, "lv_disp_drv_register failed");

    ESP_GOTO_ON_ERROR(esp_timer_start_periodic(tick_timer, TICK_PERIOD_MS * 1000), err, TAG, "tick start");
    BaseType_t core = cfg->task_core < 0 ? tskNO_AFFINITY : (BaseType_t)cfg->task_core;
    ESP_GOTO_ON_FALSE(xTaskCreatePinnedToCore(lvgl_task, "lvgl", cfg->task_stack, NULL, cfg->task_priority, NULL,
                                              core) == pdPASS,
                      ESP_ERR_NO_MEM, err, TAG, "lvgl task");

    if (out_disp) {
        *out_disp = disp;
    }
    ESP_LOGI(TAG, "LVGL %d.%d.%d ready (%dx%d, buffer %d lines in %s)", LVGL_VERSION_MAJOR, LVGL_VERSION_MINOR,
             LVGL_VERSION_PATCH, width, height, lines, cfg->buf_psram ? "PSRAM" : "SRAM");
    return ESP_OK;

err:
    if (tick_timer) {
        esp_timer_stop(tick_timer);   /* chưa chạy thì trả ESP_ERR_INVALID_STATE, bỏ qua */
        esp_timer_delete(tick_timer);
    }
    if (disp) {
        lv_disp_remove(disp);
    }
    if (s_lock) {
        vSemaphoreDelete(s_lock);
        s_lock = NULL;
    }
    heap_caps_free(buf);
    return ret;
}
