#include "node_ui.h"

#include "drv_display.h"
#include "esp_check.h"
#include "lvgl.h"

static const char *TAG = "node_ui";

LV_FONT_DECLARE(node_font_vi_16);
LV_FONT_DECLARE(node_font_vi_24);

/* Cùng bảng màu với gw_ui.c của Gateway. */
#define COLOR_BG lv_color_hex(0x10151b)
#define COLOR_CARD lv_color_hex(0x1c242d)
#define COLOR_ACCENT lv_color_hex(0x2563eb)
#define COLOR_ON_ACCENT lv_color_hex(0xdbe7ff)
#define COLOR_TEXT lv_color_hex(0xe8edf2)
#define COLOR_MUTED lv_color_hex(0x8a96a3)
#define COLOR_OK lv_color_hex(0x3ecf8e)

#define PAD 16
#define DOT_SIZE 16

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

static void build_test_screen(void)
{
    lv_obj_t *scr = lv_scr_act();
    lv_obj_set_style_bg_color(scr, COLOR_BG, 0);
    lv_obj_set_style_bg_opa(scr, LV_OPA_COVER, 0);
    lv_obj_clear_flag(scr, LV_OBJ_FLAG_SCROLLABLE);
    lv_obj_add_event_cb(scr, screen_event_cb, LV_EVENT_ALL, NULL);
    lv_coord_t width = lv_obj_get_width(scr);

    lv_obj_t *title = lv_label_create(scr);
    lv_obj_set_style_text_font(title, &node_font_vi_24, 0);
    lv_obj_set_style_text_color(title, COLOR_TEXT, 0);
    lv_label_set_text(title, LV_SYMBOL_HOME "  Node phòng khách");
    lv_obj_align(title, LV_ALIGN_TOP_LEFT, PAD, PAD);

    lv_obj_t *hint = lv_label_create(scr);
    lv_obj_set_width(hint, width - 2 * PAD);
    lv_label_set_long_mode(hint, LV_LABEL_LONG_WRAP);
    lv_obj_set_style_text_font(hint, &node_font_vi_16, 0);
    lv_obj_set_style_text_color(hint, COLOR_MUTED, 0);
    lv_label_set_text(hint, "Màn hình kiểm tra. Chạm và kéo tay: chấm xanh phải nằm đúng dưới ngón tay. Lệch thì "
                            "hiệu chuẩn lại cảm ứng trong menuconfig (README, mục Màn hình).");
    lv_obj_align_to(hint, title, LV_ALIGN_OUT_BOTTOM_LEFT, 0, 8);

    lv_obj_t *btn = lv_btn_create(scr);
    lv_obj_set_size(btn, 220, 60);
    lv_obj_set_style_bg_color(btn, COLOR_ACCENT, 0);
    lv_obj_add_flag(btn, LV_OBJ_FLAG_EVENT_BUBBLE);
    lv_obj_add_event_cb(btn, button_event_cb, LV_EVENT_CLICKED, NULL);
    lv_obj_align(btn, LV_ALIGN_CENTER, 0, 24);
    lv_obj_t *btn_label = lv_label_create(btn);
    lv_obj_set_style_text_font(btn_label, &node_font_vi_16, 0);
    lv_obj_set_style_text_color(btn_label, COLOR_ON_ACCENT, 0);
    lv_label_set_text(btn_label, LV_SYMBOL_OK "  Bấm thử");
    lv_obj_center(btn_label);

    s_count = lv_label_create(scr);
    lv_obj_set_style_text_font(s_count, &node_font_vi_16, 0);
    lv_obj_set_style_text_color(s_count, COLOR_MUTED, 0);
    lv_label_set_text(s_count, "Chưa bấm lần nào");
    lv_obj_align_to(s_count, btn, LV_ALIGN_OUT_BOTTOM_MID, 0, 10);

    lv_obj_t *bar = lv_obj_create(scr);
    lv_obj_remove_style_all(bar);
    lv_obj_set_size(bar, width, 40);
    lv_obj_set_style_bg_color(bar, COLOR_CARD, 0);
    lv_obj_set_style_bg_opa(bar, LV_OPA_COVER, 0);
    lv_obj_clear_flag(bar, LV_OBJ_FLAG_CLICKABLE);
    lv_obj_align(bar, LV_ALIGN_BOTTOM_MID, 0, 0);
    s_coord = lv_label_create(bar);
    lv_obj_set_style_text_font(s_coord, &node_font_vi_16, 0);
    lv_obj_set_style_text_color(s_coord, COLOR_TEXT, 0);
    lv_label_set_text(s_coord, "Chạm: chưa có");
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
    build_test_screen();
    drv_display_unlock();
    return ESP_OK;
}
