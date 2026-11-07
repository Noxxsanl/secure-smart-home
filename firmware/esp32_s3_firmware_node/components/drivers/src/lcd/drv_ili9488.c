#include "drv_ili9488.h"

#include <stdlib.h>
#include <sys/cdefs.h>

#include "driver/gpio.h"
#include "driver/ledc.h"
#include "esp_check.h"
#include "esp_heap_caps.h"
#include "esp_lcd_panel_commands.h"
#include "esp_lcd_panel_interface.h"
#include "freertos/FreeRTOS.h"
#include "freertos/task.h"

static const char *TAG = "drv_ili9488";

#define ILI9488_DEFAULT_PCLK_HZ (40 * 1000 * 1000)
#define ILI9488_DEFAULT_CHUNK_PX (DRV_ILI9488_H_RES * 10)
#define ILI9488_BYTES_PER_PX 3   /* RGB666 trên dây, mỗi byte dùng 6 bit cao */
#define BL_LEDC_RES LEDC_TIMER_10_BIT
#define BL_LEDC_MAX_DUTY ((1u << 10) - 1)
#define BL_LEDC_FREQ_HZ 5000

/* ---- panel esp_lcd ---------------------------------------------------------------------------------- */

typedef struct {
    esp_lcd_panel_t base;
    esp_lcd_panel_io_handle_t io;
    int reset_gpio;
    bool reset_active_high;
    int x_gap;
    int y_gap;
    uint8_t madctl;
    uint8_t in_bpp;          /* 16 hoặc 24 */
    uint8_t *buf[2];         /* bộ đệm DMA luân phiên, mỗi bộ chunk_px × 3 byte */
    size_t chunk_px;
} ili9488_panel_t;

typedef struct {
    uint8_t cmd;
    uint8_t data[15];
    uint8_t len;
} init_cmd_t;

/* Chuỗi khởi tạo phổ biến của module 3.5" (gamma, nguồn, VCOM) — theo datasheet ILI9488 V1.0. */
static const init_cmd_t INIT_SEQ[] = {
    {0xE0, {0x00, 0x03, 0x09, 0x08, 0x16, 0x0A, 0x3F, 0x78, 0x4C, 0x09, 0x0A, 0x08, 0x16, 0x1A, 0x0F}, 15},
    {0xE1, {0x00, 0x16, 0x19, 0x03, 0x0F, 0x05, 0x32, 0x45, 0x46, 0x04, 0x0E, 0x0D, 0x35, 0x37, 0x0F}, 15},
    {0xC0, {0x17, 0x15}, 2},         /* Power Control 1 */
    {0xC1, {0x41}, 1},               /* Power Control 2 */
    {0xC5, {0x00, 0x12, 0x80}, 3},   /* VCOM */
    {LCD_CMD_COLMOD, {0x66}, 1},     /* 18 bit/điểm — SPI 4 dây không hỗ trợ 16 bit */
    {0xB0, {0x00}, 1},               /* Interface Mode */
    {0xB1, {0xA0}, 1},               /* Frame Rate ~60 Hz */
    {0xB4, {0x02}, 1},               /* Display Inversion: 2-dot */
    {0xB6, {0x02, 0x02, 0x3B}, 3},   /* Display Function Control */
    {0xB7, {0xC6}, 1},               /* Entry Mode */
    {0xF7, {0xA9, 0x51, 0x2C, 0x82}, 4}, /* Adjust Control 3 */
};

static esp_err_t tx_madctl(ili9488_panel_t *p)
{
    return esp_lcd_panel_io_tx_param(p->io, LCD_CMD_MADCTL, &p->madctl, 1);
}

static esp_err_t set_window(ili9488_panel_t *p, int x0, int y0, int x1, int y1)
{
    x0 += p->x_gap;
    x1 += p->x_gap;
    y0 += p->y_gap;
    y1 += p->y_gap;
    ESP_RETURN_ON_ERROR(esp_lcd_panel_io_tx_param(p->io, LCD_CMD_CASET, (uint8_t[]) {
        (x0 >> 8) & 0xFF, x0 & 0xFF, ((x1 - 1) >> 8) & 0xFF, (x1 - 1) & 0xFF,
    }, 4), TAG, "CASET failed");
    ESP_RETURN_ON_ERROR(esp_lcd_panel_io_tx_param(p->io, LCD_CMD_RASET, (uint8_t[]) {
        (y0 >> 8) & 0xFF, y0 & 0xFF, ((y1 - 1) >> 8) & 0xFF, (y1 - 1) & 0xFF,
    }, 4), TAG, "RASET failed");
    return ESP_OK;
}

static esp_err_t panel_reset(esp_lcd_panel_t *panel)
{
    ili9488_panel_t *p = __containerof(panel, ili9488_panel_t, base);
    if (p->reset_gpio >= 0) {
        gpio_set_level(p->reset_gpio, p->reset_active_high);
        vTaskDelay(pdMS_TO_TICKS(10));
        gpio_set_level(p->reset_gpio, !p->reset_active_high);
    } else {
        ESP_RETURN_ON_ERROR(esp_lcd_panel_io_tx_param(p->io, LCD_CMD_SWRESET, NULL, 0), TAG, "SWRESET failed");
    }
    vTaskDelay(pdMS_TO_TICKS(120));
    return ESP_OK;
}

static esp_err_t panel_init(esp_lcd_panel_t *panel)
{
    ili9488_panel_t *p = __containerof(panel, ili9488_panel_t, base);
    for (size_t i = 0; i < sizeof(INIT_SEQ) / sizeof(INIT_SEQ[0]); i++) {
        ESP_RETURN_ON_ERROR(esp_lcd_panel_io_tx_param(p->io, INIT_SEQ[i].cmd, INIT_SEQ[i].data, INIT_SEQ[i].len),
                            TAG, "init cmd 0x%02x failed", INIT_SEQ[i].cmd);
    }
    ESP_RETURN_ON_ERROR(tx_madctl(p), TAG, "MADCTL failed");
    ESP_RETURN_ON_ERROR(esp_lcd_panel_io_tx_param(p->io, LCD_CMD_SLPOUT, NULL, 0), TAG, "SLPOUT failed");
    vTaskDelay(pdMS_TO_TICKS(120));
    return ESP_OK;
}

static inline void rgb565_to_666(const uint16_t *src, uint8_t *dst, size_t n)
{
    for (size_t i = 0; i < n; i++) {
        uint16_t c = src[i];
        dst[3 * i] = (uint8_t)((c >> 8) & 0xF8);       /* R5 → 6 bit cao */
        dst[3 * i + 1] = (uint8_t)((c >> 3) & 0xFC);   /* G6 */
        dst[3 * i + 2] = (uint8_t)((c << 3) & 0xF8);   /* B5 */
    }
}

static esp_err_t panel_draw_bitmap(esp_lcd_panel_t *panel, int x_start, int y_start, int x_end, int y_end,
                                   const void *color_data)
{
    ili9488_panel_t *p = __containerof(panel, ili9488_panel_t, base);
    ESP_RETURN_ON_FALSE(color_data && x_start < x_end && y_start < y_end, ESP_ERR_INVALID_ARG, TAG, "bad area");
    ESP_RETURN_ON_ERROR(set_window(p, x_start, y_start, x_end, y_end), TAG, "window");

    size_t remaining = (size_t)(x_end - x_start) * (size_t)(y_end - y_start);
    if (p->in_bpp == 24) {
        return esp_lcd_panel_io_tx_color(p->io, LCD_CMD_RAMWR, color_data, remaining * ILI9488_BYTES_PER_PX);
    }

    /*
     * tx_color có gửi lệnh (RAMWR/RAMWRC) sẽ chờ các khúc đang truyền xong trước — nên khi đổi màu vào
     * bộ đệm này, bộ còn lại có thể vẫn đang truyền, còn bộ này chắc chắn đã rảnh.
     */
    const uint16_t *src = color_data;
    int cmd = LCD_CMD_RAMWR;
    int idx = 0;
    while (remaining > 0) {
        size_t n = remaining < p->chunk_px ? remaining : p->chunk_px;
        rgb565_to_666(src, p->buf[idx], n);
        ESP_RETURN_ON_ERROR(esp_lcd_panel_io_tx_color(p->io, cmd, p->buf[idx], n * ILI9488_BYTES_PER_PX), TAG,
                            "tx color failed");
        cmd = LCD_CMD_RAMWRC;
        idx ^= 1;
        src += n;
        remaining -= n;
    }
    return ESP_OK;
}

static esp_err_t panel_fill(ili9488_panel_t *p, int x0, int y0, int x1, int y1, uint16_t rgb565)
{
    ESP_RETURN_ON_ERROR(set_window(p, x0, y0, x1, y1), TAG, "window");   /* chờ mọi khúc cũ xong */
    size_t remaining = (size_t)(x1 - x0) * (size_t)(y1 - y0);
    size_t n = remaining < p->chunk_px ? remaining : p->chunk_px;
    uint8_t r = (uint8_t)((rgb565 >> 8) & 0xF8);
    uint8_t g = (uint8_t)((rgb565 >> 3) & 0xFC);
    uint8_t b = (uint8_t)((rgb565 << 3) & 0xF8);
    uint8_t *dst = p->buf[0];
    for (size_t i = 0; i < n; i++) {
        dst[3 * i] = r;
        dst[3 * i + 1] = g;
        dst[3 * i + 2] = b;
    }
    /* Cùng 1 bộ đệm, nội dung không đổi giữa các khúc → không cần luân phiên. */
    int cmd = LCD_CMD_RAMWR;
    while (remaining > 0) {
        size_t m = remaining < p->chunk_px ? remaining : p->chunk_px;
        ESP_RETURN_ON_ERROR(esp_lcd_panel_io_tx_color(p->io, cmd, dst, m * ILI9488_BYTES_PER_PX), TAG,
                            "tx color failed");
        cmd = LCD_CMD_RAMWRC;
        remaining -= m;
    }
    return ESP_OK;
}

static esp_err_t panel_mirror(esp_lcd_panel_t *panel, bool mirror_x, bool mirror_y)
{
    ili9488_panel_t *p = __containerof(panel, ili9488_panel_t, base);
    p->madctl = mirror_x ? (p->madctl | LCD_CMD_MX_BIT) : (p->madctl & ~LCD_CMD_MX_BIT);
    p->madctl = mirror_y ? (p->madctl | LCD_CMD_MY_BIT) : (p->madctl & ~LCD_CMD_MY_BIT);
    return tx_madctl(p);
}

static esp_err_t panel_swap_xy(esp_lcd_panel_t *panel, bool swap_axes)
{
    ili9488_panel_t *p = __containerof(panel, ili9488_panel_t, base);
    p->madctl = swap_axes ? (p->madctl | LCD_CMD_MV_BIT) : (p->madctl & ~LCD_CMD_MV_BIT);
    return tx_madctl(p);
}

static esp_err_t panel_set_gap(esp_lcd_panel_t *panel, int x_gap, int y_gap)
{
    ili9488_panel_t *p = __containerof(panel, ili9488_panel_t, base);
    p->x_gap = x_gap;
    p->y_gap = y_gap;
    return ESP_OK;
}

static esp_err_t panel_invert_color(esp_lcd_panel_t *panel, bool invert)
{
    ili9488_panel_t *p = __containerof(panel, ili9488_panel_t, base);
    return esp_lcd_panel_io_tx_param(p->io, invert ? LCD_CMD_INVON : LCD_CMD_INVOFF, NULL, 0);
}

static esp_err_t panel_disp_on_off(esp_lcd_panel_t *panel, bool on)
{
    ili9488_panel_t *p = __containerof(panel, ili9488_panel_t, base);
    return esp_lcd_panel_io_tx_param(p->io, on ? LCD_CMD_DISPON : LCD_CMD_DISPOFF, NULL, 0);
}

static esp_err_t panel_disp_sleep(esp_lcd_panel_t *panel, bool sleep)
{
    ili9488_panel_t *p = __containerof(panel, ili9488_panel_t, base);
    ESP_RETURN_ON_ERROR(esp_lcd_panel_io_tx_param(p->io, sleep ? LCD_CMD_SLPIN : LCD_CMD_SLPOUT, NULL, 0), TAG,
                        "sleep cmd failed");
    vTaskDelay(pdMS_TO_TICKS(120));
    return ESP_OK;
}

static esp_err_t panel_del(esp_lcd_panel_t *panel)
{
    ili9488_panel_t *p = __containerof(panel, ili9488_panel_t, base);
    if (p->reset_gpio >= 0) {
        gpio_reset_pin(p->reset_gpio);
    }
    heap_caps_free(p->buf[0]);
    heap_caps_free(p->buf[1]);
    free(p);
    return ESP_OK;
}

esp_err_t drv_ili9488_new_panel(esp_lcd_panel_io_handle_t io, const esp_lcd_panel_dev_config_t *dev_cfg,
                                size_t chunk_pixels, esp_lcd_panel_handle_t *ret_panel)
{
    ESP_RETURN_ON_FALSE(io && dev_cfg && ret_panel, ESP_ERR_INVALID_ARG, TAG, "null arg");
    ESP_RETURN_ON_FALSE(dev_cfg->bits_per_pixel == 16 || dev_cfg->bits_per_pixel == 24, ESP_ERR_NOT_SUPPORTED, TAG,
                        "bits_per_pixel must be 16 or 24");

    ili9488_panel_t *p = calloc(1, sizeof(*p));
    ESP_RETURN_ON_FALSE(p, ESP_ERR_NO_MEM, TAG, "no mem");
    p->io = io;
    p->reset_gpio = dev_cfg->reset_gpio_num;
    p->reset_active_high = dev_cfg->flags.reset_active_high;
    p->in_bpp = (uint8_t)dev_cfg->bits_per_pixel;
    p->madctl = (dev_cfg->rgb_ele_order == LCD_RGB_ELEMENT_ORDER_BGR) ? LCD_CMD_BGR_BIT : 0;
    p->chunk_px = chunk_pixels ? chunk_pixels : ILI9488_DEFAULT_CHUNK_PX;

    esp_err_t ret = ESP_OK;
    for (int i = 0; i < 2; i++) {
        p->buf[i] = heap_caps_malloc(p->chunk_px * ILI9488_BYTES_PER_PX, MALLOC_CAP_DMA | MALLOC_CAP_INTERNAL);
        ESP_GOTO_ON_FALSE(p->buf[i], ESP_ERR_NO_MEM, err, TAG, "no DMA mem for %u px chunk", (unsigned)p->chunk_px);
    }

    if (p->reset_gpio >= 0) {
        gpio_set_level(p->reset_gpio, !p->reset_active_high);
        gpio_config_t io_cfg = {
            .pin_bit_mask = 1ULL << p->reset_gpio,
            .mode = GPIO_MODE_OUTPUT,
        };
        ESP_GOTO_ON_ERROR(gpio_config(&io_cfg), err, TAG, "reset gpio config failed");
    }

    p->base.reset = panel_reset;
    p->base.init = panel_init;
    p->base.del = panel_del;
    p->base.draw_bitmap = panel_draw_bitmap;
    p->base.mirror = panel_mirror;
    p->base.swap_xy = panel_swap_xy;
    p->base.set_gap = panel_set_gap;
    p->base.invert_color = panel_invert_color;
    p->base.disp_on_off = panel_disp_on_off;
    p->base.disp_sleep = panel_disp_sleep;
    *ret_panel = &p->base;
    return ESP_OK;

err:
    heap_caps_free(p->buf[0]);
    heap_caps_free(p->buf[1]);
    free(p);
    return ret;
}

/* ---- tiện ích mức cao ------------------------------------------------------------------------------- */

struct drv_ili9488 {
    esp_lcd_panel_io_handle_t io;
    esp_lcd_panel_handle_t panel;
    int bl_gpio;
    ledc_channel_t bl_channel;
    int width;
    int height;
};

static esp_err_t backlight_init(struct drv_ili9488 *h, const drv_ili9488_config_t *cfg)
{
    h->bl_gpio = cfg->bl_gpio;
    if (cfg->bl_gpio < 0) {
        return ESP_OK;
    }
    h->bl_channel = (ledc_channel_t)cfg->bl_ledc_channel;
    ledc_timer_config_t timer = {
        .speed_mode = LEDC_LOW_SPEED_MODE,
        .duty_resolution = BL_LEDC_RES,
        .timer_num = (ledc_timer_t)cfg->bl_ledc_timer,
        .freq_hz = BL_LEDC_FREQ_HZ,
        .clk_cfg = LEDC_AUTO_CLK,
    };
    ESP_RETURN_ON_ERROR(ledc_timer_config(&timer), TAG, "backlight timer failed");
    ledc_channel_config_t ch = {
        .gpio_num = cfg->bl_gpio,
        .speed_mode = LEDC_LOW_SPEED_MODE,
        .channel = h->bl_channel,
        .intr_type = LEDC_INTR_DISABLE,
        .timer_sel = (ledc_timer_t)cfg->bl_ledc_timer,
        .duty = 0,
        .hpoint = 0,
        .flags.output_invert = cfg->bl_active_low,
    };
    return ledc_channel_config(&ch);
}

esp_err_t drv_ili9488_set_backlight(drv_ili9488_handle_t h, uint8_t percent)
{
    ESP_RETURN_ON_FALSE(h, ESP_ERR_INVALID_ARG, TAG, "null arg");
    if (h->bl_gpio < 0) {
        return ESP_ERR_NOT_SUPPORTED;
    }
    if (percent > 100) {
        percent = 100;
    }
    uint32_t duty = BL_LEDC_MAX_DUTY * percent / 100;
    ESP_RETURN_ON_ERROR(ledc_set_duty(LEDC_LOW_SPEED_MODE, h->bl_channel, duty), TAG, "set duty failed");
    return ledc_update_duty(LEDC_LOW_SPEED_MODE, h->bl_channel);
}

esp_err_t drv_ili9488_set_rotation(drv_ili9488_handle_t h, drv_ili9488_rotation_t rot)
{
    ESP_RETURN_ON_FALSE(h, ESP_ERR_INVALID_ARG, TAG, "null arg");
    /* Tương ứng MADCTL 0x48 / 0x28 / 0x88 / 0xE8 (kèm bit BGR) của module 3.5" thông dụng. */
    bool swap = (rot == DRV_ILI9488_ROT_90 || rot == DRV_ILI9488_ROT_270);
    bool mx = (rot == DRV_ILI9488_ROT_0 || rot == DRV_ILI9488_ROT_270);
    bool my = (rot == DRV_ILI9488_ROT_180 || rot == DRV_ILI9488_ROT_270);
    ESP_RETURN_ON_ERROR(esp_lcd_panel_swap_xy(h->panel, swap), TAG, "swap_xy failed");
    ESP_RETURN_ON_ERROR(esp_lcd_panel_mirror(h->panel, mx, my), TAG, "mirror failed");
    h->width = swap ? DRV_ILI9488_V_RES : DRV_ILI9488_H_RES;
    h->height = swap ? DRV_ILI9488_H_RES : DRV_ILI9488_V_RES;
    return ESP_OK;
}

void drv_ili9488_get_size(drv_ili9488_handle_t h, int *width, int *height)
{
    if (width) {
        *width = h ? h->width : 0;
    }
    if (height) {
        *height = h ? h->height : 0;
    }
}

esp_err_t drv_ili9488_fill(drv_ili9488_handle_t h, int x, int y, int w, int hgt, uint16_t rgb565)
{
    ESP_RETURN_ON_FALSE(h && w > 0 && hgt > 0, ESP_ERR_INVALID_ARG, TAG, "bad area");
    ESP_RETURN_ON_FALSE(x >= 0 && y >= 0 && x + w <= h->width && y + hgt <= h->height, ESP_ERR_INVALID_ARG, TAG,
                        "area out of screen");
    ili9488_panel_t *p = __containerof(h->panel, ili9488_panel_t, base);
    return panel_fill(p, x, y, x + w, y + hgt, rgb565);
}

esp_err_t drv_ili9488_init(const drv_ili9488_config_t *cfg, drv_ili9488_handle_t *out)
{
    ESP_RETURN_ON_FALSE(cfg && out, ESP_ERR_INVALID_ARG, TAG, "null arg");
    struct drv_ili9488 *h = calloc(1, sizeof(*h));
    ESP_RETURN_ON_FALSE(h, ESP_ERR_NO_MEM, TAG, "no mem");
    h->bl_gpio = -1;
    esp_err_t ret = ESP_OK;

    esp_lcd_panel_io_spi_config_t io_cfg = {
        .cs_gpio_num = cfg->cs_gpio,
        .dc_gpio_num = cfg->dc_gpio,
        .spi_mode = 0,
        .pclk_hz = cfg->pclk_hz ? cfg->pclk_hz : ILI9488_DEFAULT_PCLK_HZ,
        .trans_queue_depth = 10,
        .lcd_cmd_bits = 8,
        .lcd_param_bits = 8,
    };
    ESP_GOTO_ON_ERROR(esp_lcd_new_panel_io_spi((esp_lcd_spi_bus_handle_t)cfg->host, &io_cfg, &h->io), err, TAG,
                      "panel io failed (SPI bus initialised?)");

    esp_lcd_panel_dev_config_t dev_cfg = {
        .reset_gpio_num = cfg->rst_gpio,
        .rgb_ele_order = cfg->bgr ? LCD_RGB_ELEMENT_ORDER_BGR : LCD_RGB_ELEMENT_ORDER_RGB,
        .bits_per_pixel = 16,
    };
    ESP_GOTO_ON_ERROR(drv_ili9488_new_panel(h->io, &dev_cfg, cfg->chunk_pixels, &h->panel), err, TAG, "panel");
    ESP_GOTO_ON_ERROR(esp_lcd_panel_reset(h->panel), err, TAG, "reset");
    ESP_GOTO_ON_ERROR(esp_lcd_panel_init(h->panel), err, TAG, "init");
    ESP_GOTO_ON_ERROR(esp_lcd_panel_invert_color(h->panel, cfg->invert_color), err, TAG, "invert");
    ESP_GOTO_ON_ERROR(drv_ili9488_set_rotation(h, DRV_ILI9488_ROT_0), err, TAG, "rotation");
    ESP_GOTO_ON_ERROR(drv_ili9488_fill(h, 0, 0, h->width, h->height, 0x0000), err, TAG, "clear");
    ESP_GOTO_ON_ERROR(esp_lcd_panel_disp_on_off(h->panel, true), err, TAG, "display on");
    ESP_GOTO_ON_ERROR(backlight_init(h, cfg), err, TAG, "backlight");

    *out = h;
    ESP_LOGI(TAG, "ILI9488 ready (%dx%d, %u MHz)", h->width, h->height, (unsigned)(io_cfg.pclk_hz / 1000000));
    return ESP_OK;

err:
    if (h->panel) {
        esp_lcd_panel_del(h->panel);
    }
    if (h->io) {
        esp_lcd_panel_io_del(h->io);
    }
    free(h);
    return ret;
}

esp_lcd_panel_handle_t drv_ili9488_panel(drv_ili9488_handle_t h)
{
    return h ? h->panel : NULL;
}

esp_lcd_panel_io_handle_t drv_ili9488_io(drv_ili9488_handle_t h)
{
    return h ? h->io : NULL;
}

esp_err_t drv_ili9488_del(drv_ili9488_handle_t h)
{
    if (h == NULL) {
        return ESP_ERR_INVALID_ARG;
    }
    if (h->bl_gpio >= 0) {
        ledc_stop(LEDC_LOW_SPEED_MODE, h->bl_channel, 0);
    }
    esp_lcd_panel_del(h->panel);
    esp_lcd_panel_io_del(h->io);
    free(h);
    return ESP_OK;
}
