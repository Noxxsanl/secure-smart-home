#include "node_ui.h"

#include <stdio.h>
#include <string.h>
#include <time.h>

#include "drv_display.h"
#include "esp_check.h"
#include "lvgl.h"

static const char *TAG = "node_ui";

LV_FONT_DECLARE(node_font_vi_16);
LV_FONT_DECLARE(node_font_vi_24);

/* Cùng bảng màu với gw_ui.c của Gateway. */
#define COLOR_BG lv_color_hex(0x10151b)
#define COLOR_CARD lv_color_hex(0x1c242d)
#define COLOR_TILE lv_color_hex(0x252f3b)
#define COLOR_ACCENT lv_color_hex(0x2563eb)
#define COLOR_ON_ACCENT lv_color_hex(0xdbe7ff)
#define COLOR_TEXT lv_color_hex(0xe8edf2)
#define COLOR_MUTED lv_color_hex(0x8a96a3)
#define COLOR_OK lv_color_hex(0x3ecf8e)
#define COLOR_WARN lv_color_hex(0xf5b942)
#define COLOR_BAD lv_color_hex(0xf06a5b)

/* Số lớn: Montserrat 40 có sẵn của LVGL (chỉ cần chữ số, dấu chấm, "--"), như FONT_BIG của Gateway. */
#define FONT_BIG (&lv_font_montserrat_40)

#define PAD 16
#define GAP 16
#define TILE_Y 52
#define TILE_H 120
#define BAR_H 40
#define BTN_W 180
#define BTN_H 48
#define DOT_SIZE 16
#define LINK_DOT 12

enum { CLIMATE_TEMP, CLIMATE_HUMI, CLIMATE_COUNT };

static lv_obj_t *s_climate_val[CLIMATE_COUNT];
static lv_obj_t *s_climate_status;
static lv_obj_t *s_link_dot;
static lv_obj_t *s_link_label;
static lv_obj_t *s_dot;
static lv_obj_t *s_coord;
static lv_obj_t *s_count;
static unsigned s_clicks;

/* Nhận cả sự kiện nổi lên từ nút (LV_OBJ_FLAG_EVENT_BUBBLE) nên chấm vẫn chạy theo tay khi ấn lên nút. */
static void screen_event_cb(lv_event_t *e)
{
    lv_event_code_t code = lv_event_get_code(e);
    if (code != LV_EVENT_PRESSED && code != LV_EVENT_PRESSING) {
        return;
    }
    lv_indev_t *indev = lv_indev_get_act();
    if (indev == NULL) {
        return;
    }
    lv_point_t p;
    lv_indev_get_point(indev, &p);
    lv_obj_clear_flag(s_dot, LV_OBJ_FLAG_HIDDEN);
    lv_obj_set_pos(s_dot, p.x - DOT_SIZE / 2, p.y - DOT_SIZE / 2);
    lv_label_set_text_fmt(s_coord, "Chạm: x = %d, y = %d", (int)p.x, (int)p.y);
}

static void button_event_cb(lv_event_t *e)
{
    (void)e;
    s_clicks++;
    lv_label_set_text_fmt(s_count, "Đã bấm %u lần", s_clicks);
    lv_obj_set_style_text_color(s_count, COLOR_OK, 0);
}

static lv_obj_t *make_label(lv_obj_t *parent, const lv_font_t *font, lv_coord_t x, lv_coord_t y, const char *text,
                            lv_color_t color)
{
    lv_obj_t *l = lv_label_create(parent);
    lv_label_set_text(l, text);
    lv_obj_set_style_text_font(l, font, 0);
    lv_obj_set_style_text_color(l, color, 0);
    lv_obj_set_pos(l, x, y);
    return l;
}

/* Ô không nhận chạm: chạm lên ô vẫn tới màn hình → chấm kiểm tra cảm ứng vẫn chạy. */
static lv_obj_t *make_tile(lv_obj_t *parent, lv_coord_t x, lv_coord_t y, lv_coord_t w, lv_coord_t h)
{
    lv_obj_t *t = lv_obj_create(parent);
    lv_obj_remove_style_all(t);
    lv_obj_set_pos(t, x, y);
    lv_obj_set_size(t, w, h);
    lv_obj_set_style_bg_color(t, COLOR_TILE, 0);
    lv_obj_set_style_bg_opa(t, LV_OPA_COVER, 0);
    lv_obj_set_style_radius(t, 10, 0);
    lv_obj_clear_flag(t, LV_OBJ_FLAG_CLICKABLE | LV_OBJ_FLAG_SCROLLABLE);
    return t;
}

static void build_climate(lv_obj_t *scr, lv_coord_t width)
{
    static const char *const names[CLIMATE_COUNT] = {"Nhiệt độ", "Độ ẩm"};
    static const char *const units[CLIMATE_COUNT] = {"°C", "%"};
    lv_coord_t tile_w = (width - 2 * PAD - GAP) / 2;
    for (int i = 0; i < CLIMATE_COUNT; i++) {
        lv_obj_t *tile = make_tile(scr, PAD + (lv_coord_t)i * (tile_w + GAP), TILE_Y, tile_w, TILE_H);
        make_label(tile, &node_font_vi_16, 14, 12, names[i], COLOR_MUTED);
        s_climate_val[i] = make_label(tile, FONT_BIG, 14, 38, "--", COLOR_MUTED);
        make_label(tile, &node_font_vi_24, 14, 84, units[i], COLOR_MUTED);
    }
    s_climate_status = lv_label_create(scr);
    lv_obj_set_width(s_climate_status, width - 2 * PAD);
    lv_label_set_long_mode(s_climate_status, LV_LABEL_LONG_WRAP);
    lv_obj_set_style_text_font(s_climate_status, &node_font_vi_16, 0);
    lv_obj_set_style_text_color(s_climate_status, COLOR_MUTED, 0);
    lv_label_set_text(s_climate_status, "Đang tìm cảm biến nhiệt độ, độ ẩm...");
    lv_obj_set_pos(s_climate_status, PAD, TILE_Y + TILE_H + 8);
}

static void build_screen(void)
{
    lv_obj_t *scr = lv_scr_act();
    lv_obj_set_style_bg_color(scr, COLOR_BG, 0);
    lv_obj_set_style_bg_opa(scr, LV_OPA_COVER, 0);
    lv_obj_clear_flag(scr, LV_OBJ_FLAG_SCROLLABLE);
    lv_obj_add_event_cb(scr, screen_event_cb, LV_EVENT_ALL, NULL);
    lv_coord_t width = lv_obj_get_width(scr);
    lv_coord_t height = lv_obj_get_height(scr);

    make_label(scr, &node_font_vi_24, PAD, 12, LV_SYMBOL_HOME "  Node phòng khách", COLOR_TEXT);

    /* Kết nối Gateway ở góc phải: chấm cố định sát mép, chữ canh phải ngay trước chấm (lv_obj_align tự canh lại
     * khi chữ đổi độ dài). */
    s_link_dot = lv_obj_create(scr);
    lv_obj_remove_style_all(s_link_dot);
    lv_obj_set_size(s_link_dot, LINK_DOT, LINK_DOT);
    lv_obj_set_style_radius(s_link_dot, LV_RADIUS_CIRCLE, 0);
    lv_obj_set_style_bg_opa(s_link_dot, LV_OPA_COVER, 0);
    lv_obj_set_style_bg_color(s_link_dot, COLOR_MUTED, 0);
    lv_obj_clear_flag(s_link_dot, LV_OBJ_FLAG_CLICKABLE);
    lv_obj_align(s_link_dot, LV_ALIGN_TOP_RIGHT, -PAD, 20);
    s_link_label = lv_label_create(scr);
    lv_obj_set_style_text_font(s_link_label, &node_font_vi_16, 0);
    lv_obj_set_style_text_color(s_link_label, COLOR_MUTED, 0);
    lv_label_set_text(s_link_label, "Gateway: --");
    lv_obj_align(s_link_label, LV_ALIGN_TOP_RIGHT, -(PAD + LINK_DOT + 8), 16);

    build_climate(scr, width);

    /* Phần kiểm tra cảm ứng: nút đếm số lần bấm, thanh dưới hiện toạ độ, chấm xanh theo ngón tay. */
    lv_obj_t *btn = lv_btn_create(scr);
    lv_obj_set_size(btn, BTN_W, BTN_H);
    lv_obj_set_style_bg_color(btn, COLOR_ACCENT, 0);
    lv_obj_add_flag(btn, LV_OBJ_FLAG_EVENT_BUBBLE);
    lv_obj_add_event_cb(btn, button_event_cb, LV_EVENT_CLICKED, NULL);
    lv_obj_set_pos(btn, PAD, height - BAR_H - 12 - BTN_H);
    lv_obj_t *btn_label = lv_label_create(btn);
    lv_obj_set_style_text_font(btn_label, &node_font_vi_16, 0);
    lv_obj_set_style_text_color(btn_label, COLOR_ON_ACCENT, 0);
    lv_label_set_text(btn_label, LV_SYMBOL_OK "  Bấm thử");
    lv_obj_center(btn_label);

    s_count = lv_label_create(scr);
    lv_obj_set_style_text_font(s_count, &node_font_vi_16, 0);
    lv_obj_set_style_text_color(s_count, COLOR_MUTED, 0);
    lv_label_set_text(s_count, "Chưa bấm lần nào");
    lv_obj_align_to(s_count, btn, LV_ALIGN_OUT_RIGHT_MID, GAP, 0);

    lv_obj_t *bar = lv_obj_create(scr);
    lv_obj_remove_style_all(bar);
    lv_obj_set_size(bar, width, BAR_H);
    lv_obj_set_style_bg_color(bar, COLOR_CARD, 0);
    lv_obj_set_style_bg_opa(bar, LV_OPA_COVER, 0);
    lv_obj_clear_flag(bar, LV_OBJ_FLAG_CLICKABLE);
    lv_obj_align(bar, LV_ALIGN_BOTTOM_MID, 0, 0);
    s_coord = lv_label_create(bar);
    lv_obj_set_style_text_font(s_coord, &node_font_vi_16, 0);
    lv_obj_set_style_text_color(s_coord, COLOR_TEXT, 0);
    lv_label_set_text(s_coord, "Chạm thử: chấm xanh phải nằm đúng dưới ngón tay");
    lv_obj_align(s_coord, LV_ALIGN_LEFT_MID, PAD, 0);

    /* Tạo sau cùng để nằm trên mọi đối tượng; không nhận chạm. */
    s_dot = lv_obj_create(scr);
    lv_obj_remove_style_all(s_dot);
    lv_obj_set_size(s_dot, DOT_SIZE, DOT_SIZE);
    lv_obj_set_style_radius(s_dot, LV_RADIUS_CIRCLE, 0);
    lv_obj_set_style_bg_color(s_dot, COLOR_OK, 0);
    lv_obj_set_style_bg_opa(s_dot, LV_OPA_COVER, 0);
    lv_obj_clear_flag(s_dot, LV_OBJ_FLAG_CLICKABLE);
    lv_obj_add_flag(s_dot, LV_OBJ_FLAG_HIDDEN);
}

esp_err_t node_ui_start(void)
{
    ESP_RETURN_ON_FALSE(drv_display_lock(-1), ESP_ERR_INVALID_STATE, TAG, "display not initialised");
    build_screen();
    drv_display_unlock();
    return ESP_OK;
}

void node_ui_set_climate(bool ok, float temperature_c, float humidity_pct)
{
    if (s_climate_status == NULL || !drv_display_lock(-1)) {
        return;
    }
    if (ok) {
        char buf[16];
        snprintf(buf, sizeof(buf), "%.1f", (double)temperature_c);
        lv_label_set_text(s_climate_val[CLIMATE_TEMP], buf);
        snprintf(buf, sizeof(buf), "%.0f", (double)humidity_pct);
        lv_label_set_text(s_climate_val[CLIMATE_HUMI], buf);
        lv_label_set_text(s_climate_status, "Cảm biến nhiệt độ, độ ẩm đang hoạt động");
    } else {
        lv_label_set_text(s_climate_val[CLIMATE_TEMP], "--");
        lv_label_set_text(s_climate_val[CLIMATE_HUMI], "--");
        lv_label_set_text(s_climate_status, LV_SYMBOL_WARNING " Không đọc được cảm biến nhiệt độ, độ ẩm. Kiểm dây SDA, "
                                                              "SCL, nguồn 3V3 và GND; cắm lại thì chờ vài giây.");
    }
    for (int i = 0; i < CLIMATE_COUNT; i++) {
        lv_obj_set_style_text_color(s_climate_val[i], ok ? COLOR_TEXT : COLOR_MUTED, 0);
    }
    lv_obj_set_style_text_color(s_climate_status, ok ? COLOR_OK : COLOR_BAD, 0);
    drv_display_unlock();
}

void node_ui_set_link(node_ui_link_t link, int64_t last_sent_ts)
{
    /* Chữ ngắn: góc phải chỉ còn ~200 px cạnh tiêu đề cỡ 24. */
    char text[48];
    lv_color_t color;
    switch (link) {
    case NODE_UI_LINK_ONLINE:
        color = COLOR_OK;
        if (last_sent_ts > 0) {
            time_t t = (time_t)last_sent_ts;
            struct tm tm;
            localtime_r(&t, &tm);   /* múi giờ đặt ở application (TZ) */
            strftime(text, sizeof(text), "Đã gửi lúc %H:%M:%S", &tm);
        } else {
            strlcpy(text, "Đã nối Gateway", sizeof(text));
        }
        break;
    case NODE_UI_LINK_SEARCHING:
        color = COLOR_WARN;
        strlcpy(text, "Đang tìm Gateway...", sizeof(text));
        break;
    default:
        color = COLOR_BAD;
        strlcpy(text, "Chưa ghép nối Gateway", sizeof(text));
        break;
    }
    if (s_link_label == NULL || !drv_display_lock(-1)) {
        return;
    }
    lv_label_set_text(s_link_label, text);
    lv_obj_set_style_text_color(s_link_label, color, 0);
    lv_obj_set_style_bg_color(s_link_dot, color, 0);
    drv_display_unlock();
}
