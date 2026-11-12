#include "node_ui.h"

#include <math.h>
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
#define COLOR_TILE_ON lv_color_hex(0x173a2a)   /* ô thiết bị đang bật/mở */
#define COLOR_TEXT lv_color_hex(0xe8edf2)
#define COLOR_MUTED lv_color_hex(0x8a96a3)
#define COLOR_OK lv_color_hex(0x3ecf8e)
#define COLOR_WARN lv_color_hex(0xf5b942)
#define COLOR_BAD lv_color_hex(0xf06a5b)

/* Số lớn: Montserrat 40 có sẵn của LVGL (chỉ cần chữ số, dấu chấm, "--"), như FONT_BIG của Gateway. */
#define FONT_BIG (&lv_font_montserrat_40)

/* Bố cục theo chiều cao 320 (ngang); chiều rộng tính theo lv_obj_get_width. */
#define PAD 16
#define GAP 16
#define CLIMATE_Y 50
#define CLIMATE_H 88
#define STATUS_Y (CLIMATE_Y + CLIMATE_H + 6)   /* 144, 1 dòng */
#define DEV_Y (STATUS_Y + 26)                  /* 170 */
#define DEV_H 96
#define DEV_GAP 8
#define DEV_PAD 10
#define BAR_H 40
#define DOT_SIZE 16
#define LINK_DOT 12

enum { CLIMATE_TEMP, CLIMATE_HUMI, CLIMATE_COUNT };

static lv_obj_t *s_climate_val[CLIMATE_COUNT];
static lv_obj_t *s_climate_status;
static lv_obj_t *s_link_dot;
static lv_obj_t *s_link_label;
static lv_obj_t *s_dev_tile[NODE_UI_DEV_COUNT];
static lv_obj_t *s_dev_state[NODE_UI_DEV_COUNT];
static lv_obj_t *s_dev_sub[NODE_UI_DEV_COUNT];
static lv_obj_t *s_dot;
static lv_obj_t *s_coord;

/* Chỉ đọc/ghi khi giữ khoá LVGL. */
static int s_dev_val[NODE_UI_DEV_COUNT] = {NODE_UI_STATE_UNKNOWN, NODE_UI_STATE_UNKNOWN, NODE_UI_STATE_UNKNOWN,
                                           NODE_UI_STATE_UNKNOWN};
static float s_ac_setpoint = NAN;

/* ---- bảng Điều hòa ---- */
#define COLOR_ACCENT lv_color_hex(0x2563eb)
#define AC_TITLE_H 52
#define AC_STEP_BTN 72
#define AC_BTN_H 56
#define AC_SLOT_COUNT (1 + NODE_UI_AC_TEMP_MAX - NODE_UI_AC_TEMP_MIN + 1)   /* TẮT + 16..30 = 16 ô */
#define AC_SLOT_COLS 4
#define AC_SLOT_H 40
#define AC_MSG_Y 242
#define AC_TEMP_DEBOUNCE_MS 600
#define AC_DEFAULT_TEMP 26

enum { AC_BTN_CLOSE, AC_BTN_MINUS, AC_BTN_PLUS, AC_BTN_ON, AC_BTN_OFF, AC_BTN_LEARN };

static lv_obj_t *s_ac_panel;
static lv_obj_t *s_ac_title;
static lv_obj_t *s_ac_close_label;
static lv_obj_t *s_ac_ctrl;
static lv_obj_t *s_ac_learn;
static lv_obj_t *s_ac_temp_val;
static lv_obj_t *s_ac_power_lbl;
static lv_obj_t *s_ac_msg;
static lv_obj_t *s_ac_slot_btn[AC_SLOT_COUNT];
static lv_obj_t *s_ac_slot_lbl[AC_SLOT_COUNT];
static lv_timer_t *s_ac_temp_timer;   /* gộp các lần bấm - / +; đang chạy = có nhiệt độ chưa gửi */
static bool s_ac_temp_pending;
static int s_ac_ui_temp = AC_DEFAULT_TEMP;
static uint32_t s_ac_learned;
static node_ui_ac_callbacks_t s_ac_cbs;

/* Mọi đối tượng khác không nhận chạm nên chạm ở đâu cũng tới màn hình → chấm chạy theo tay để kiểm hiệu chuẩn. */
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
        lv_obj_t *tile = make_tile(scr, PAD + (lv_coord_t)i * (tile_w + GAP), CLIMATE_Y, tile_w, CLIMATE_H);
        make_label(tile, &node_font_vi_16, 14, 8, names[i], COLOR_MUTED);
        s_climate_val[i] = make_label(tile, FONT_BIG, 14, 34, "--", COLOR_MUTED);
        lv_obj_t *unit = make_label(tile, &node_font_vi_24, 0, 0, units[i], COLOR_MUTED);
        lv_obj_align(unit, LV_ALIGN_BOTTOM_RIGHT, -14, -12);   /* cố định: số đổi độ dài không phải canh lại */
    }
    s_climate_status = make_label(scr, &node_font_vi_16, PAD, STATUS_Y, "Đang tìm cảm biến nhiệt độ, độ ẩm...",
                                  COLOR_MUTED);
    lv_obj_set_width(s_climate_status, width - 2 * PAD);
    lv_label_set_long_mode(s_climate_status, LV_LABEL_LONG_DOT);   /* 1 dòng: ngay dưới là hàng thiết bị */
}

/* Vẽ lại 1 ô thiết bị theo s_dev_val / s_ac_setpoint (giữ khoá LVGL). Quy ước như render_room của Gateway. */
static void render_device(int i)
{
    const int st = s_dev_val[i];
    const bool known = st != NODE_UI_STATE_UNKNOWN;
    const bool on = known && st > 0;
    const bool curtain = i == NODE_UI_DEV_CURTAIN;

    lv_label_set_text(s_dev_state[i], !known ? "--" : curtain ? (on ? "MỞ" : "ĐÓNG") : (on ? "BẬT" : "TẮT"));

    char sub[24];
    if (!known) {
        strlcpy(sub, "Chưa lắp", sizeof(sub));
    } else if (i == NODE_UI_DEV_AC && on && !isnan(s_ac_setpoint)) {
        snprintf(sub, sizeof(sub), "Đặt %.0f°C", (double)s_ac_setpoint);
    } else if (curtain && st > 1) {
        snprintf(sub, sizeof(sub), "Mở %d%%", st > 100 ? 100 : st);
    } else {
        static const char *const on_text[NODE_UI_DEV_COUNT] = {"Đang sáng", "Đang chạy", "Đang mở", "Đang bật"};
        strlcpy(sub, on ? on_text[i] : (curtain ? "Đang đóng" : "Đang tắt"), sizeof(sub));
    }
    lv_label_set_text(s_dev_sub[i], sub);

    lv_obj_set_style_text_color(s_dev_state[i], on ? COLOR_OK : (known ? COLOR_TEXT : COLOR_MUTED), 0);
    lv_obj_set_style_text_color(s_dev_sub[i], on ? COLOR_OK : COLOR_MUTED, 0);
    lv_obj_set_style_bg_color(s_dev_tile[i], on ? COLOR_TILE_ON : COLOR_TILE, 0);

    if (i == NODE_UI_DEV_AC && s_ac_power_lbl != NULL) {
        lv_label_set_text(s_ac_power_lbl, !known ? "Chưa rõ trạng thái: bấm BẬT hoặc TẮT"
                                          : on   ? "Điều hòa đang BẬT (làm lạnh)"
                                                 : "Điều hòa đang TẮT");
        lv_obj_set_style_text_color(s_ac_power_lbl, on ? COLOR_OK : (known ? COLOR_TEXT : COLOR_MUTED), 0);
    }
}

/* ---- bảng Điều hòa ------------------------------------------------------------------------------------ */

static int ac_slot_temp(int idx)   /* ô 0 = TẮT, ô 1..15 = 16..30°C */
{
    return idx == 0 ? NODE_UI_AC_SLOT_OFF : NODE_UI_AC_TEMP_MIN + idx - 1;
}

static void ac_show_temp(void)
{
    lv_label_set_text_fmt(s_ac_temp_val, "%d", s_ac_ui_temp);
}

static void ac_render_slots(void)
{
    for (int i = 0; i < AC_SLOT_COUNT; i++) {
        bool learned = (s_ac_learned >> i) & 1u;
        lv_obj_set_style_bg_color(s_ac_slot_btn[i], learned ? COLOR_TILE_ON : COLOR_TILE, 0);
        lv_obj_set_style_text_color(s_ac_slot_lbl[i], learned ? COLOR_OK : COLOR_TEXT, 0);
    }
}

static void ac_set_msg(node_ui_msg_t level, const char *text)
{
    static const uint32_t colors[] = {0x8a96a3, 0x3ecf8e, 0xf5b942, 0xf06a5b};
    lv_label_set_text(s_ac_msg, text);
    lv_obj_set_style_text_color(s_ac_msg, lv_color_hex(colors[level <= NODE_UI_MSG_BAD ? level : 0]), 0);
}

static void ac_show_learn(bool learn)
{
    if (learn) {
        lv_obj_add_flag(s_ac_ctrl, LV_OBJ_FLAG_HIDDEN);
        lv_obj_clear_flag(s_ac_learn, LV_OBJ_FLAG_HIDDEN);
        lv_label_set_text(s_ac_title, "Học mã remote điều hòa");
        lv_label_set_text(s_ac_close_label, "Quay lại");
        ac_set_msg(NODE_UI_MSG_INFO, "Chạm 1 ô, chĩa remote vào mắt thu (cách 5-20 cm) rồi bấm remote trong 10 giây. "
                                     "Ô 16..30: chỉnh remote về chế độ Lạnh + đúng nhiệt độ đó. Giữ lâu ô xanh để phát thử.");
    } else {
        lv_obj_add_flag(s_ac_learn, LV_OBJ_FLAG_HIDDEN);
        lv_obj_clear_flag(s_ac_ctrl, LV_OBJ_FLAG_HIDDEN);
        lv_label_set_text(s_ac_title, "Điều hòa");
        lv_label_set_text(s_ac_close_label, "Đóng");
        ac_set_msg(NODE_UI_MSG_INFO, s_ac_learned == 0 ? "Chưa có mã nào: bấm HỌC MÃ để thu tín hiệu remote điều hòa."
                                                       : "Bấm BẬT / TẮT hoặc - / + để đổi nhiệt độ.");
    }
}

static void ac_temp_timer_cb(lv_timer_t *t)
{
    lv_timer_pause(t);
    s_ac_temp_pending = false;
    if (s_ac_cbs.on_set_temp != NULL) {
        s_ac_cbs.on_set_temp(s_ac_ui_temp, s_ac_cbs.ctx);
    }
}

static void ac_button_cb(lv_event_t *e)
{
    switch ((int)(intptr_t)lv_event_get_user_data(e)) {
    case AC_BTN_CLOSE:
        if (!lv_obj_has_flag(s_ac_learn, LV_OBJ_FLAG_HIDDEN)) {
            ac_show_learn(false);
        } else {
            lv_obj_add_flag(s_ac_panel, LV_OBJ_FLAG_HIDDEN);
        }
        break;
    case AC_BTN_MINUS:
    case AC_BTN_PLUS: {
        int step = (int)(intptr_t)lv_event_get_user_data(e) == AC_BTN_PLUS ? 1 : -1;
        int next = s_ac_ui_temp + step;
        if (next < NODE_UI_AC_TEMP_MIN || next > NODE_UI_AC_TEMP_MAX) {
            break;
        }
        s_ac_ui_temp = next;
        ac_show_temp();
        s_ac_temp_pending = true;
        lv_timer_reset(s_ac_temp_timer);
        lv_timer_resume(s_ac_temp_timer);
        break;
    }
    case AC_BTN_ON:
    case AC_BTN_OFF:
        if (s_ac_cbs.on_power != NULL) {
            s_ac_cbs.on_power((int)(intptr_t)lv_event_get_user_data(e) == AC_BTN_ON, s_ac_cbs.ctx);
        }
        break;
    case AC_BTN_LEARN:
        ac_show_learn(true);
        break;
    default:
        break;
    }
}

/* Chạm ngắn = học; giữ lâu = phát thử (LVGL 8: SHORT_CLICKED không đến sau LONG_PRESSED). */
static void ac_slot_cb(lv_event_t *e)
{
    int slot = ac_slot_temp((int)(intptr_t)lv_event_get_user_data(e));
    if (lv_event_get_code(e) == LV_EVENT_LONG_PRESSED) {
        if (s_ac_cbs.on_test != NULL) {
            s_ac_cbs.on_test(slot, s_ac_cbs.ctx);
        }
    } else if (s_ac_cbs.on_learn != NULL) {
        s_ac_cbs.on_learn(slot, s_ac_cbs.ctx);
    }
}

static void ac_tile_cb(lv_event_t *e)
{
    (void)e;
    ac_show_learn(false);
    lv_obj_clear_flag(s_ac_panel, LV_OBJ_FLAG_HIDDEN);
}

static lv_obj_t *make_button(lv_obj_t *parent, lv_coord_t x, lv_coord_t y, lv_coord_t w, lv_coord_t h, const char *text,
                             const lv_font_t *font, lv_color_t bg, lv_obj_t **label_out)
{
    lv_obj_t *b = lv_btn_create(parent);
    lv_obj_set_pos(b, x, y);
    lv_obj_set_size(b, w, h);
    lv_obj_set_style_bg_color(b, bg, 0);
    lv_obj_set_style_radius(b, 10, 0);
    lv_obj_t *l = lv_label_create(b);
    lv_obj_set_style_text_font(l, font, 0);
    lv_obj_set_style_text_color(l, COLOR_TEXT, 0);
    lv_label_set_text(l, text);
    lv_obj_center(l);
    if (label_out != NULL) {
        *label_out = l;
    }
    return b;
}

static lv_obj_t *make_view(lv_obj_t *parent, lv_coord_t width, lv_coord_t height)
{
    lv_obj_t *v = lv_obj_create(parent);
    lv_obj_remove_style_all(v);
    lv_obj_set_pos(v, 0, AC_TITLE_H);
    lv_obj_set_size(v, width, height);
    lv_obj_clear_flag(v, LV_OBJ_FLAG_CLICKABLE | LV_OBJ_FLAG_SCROLLABLE);
    return v;
}

static void build_ac_panel(lv_obj_t *scr, lv_coord_t width, lv_coord_t height)
{
    s_ac_panel = lv_obj_create(scr);
    lv_obj_remove_style_all(s_ac_panel);
    lv_obj_set_size(s_ac_panel, width, height);
    lv_obj_set_style_bg_color(s_ac_panel, COLOR_BG, 0);
    lv_obj_set_style_bg_opa(s_ac_panel, LV_OPA_COVER, 0);
    lv_obj_clear_flag(s_ac_panel, LV_OBJ_FLAG_SCROLLABLE);   /* vẫn nhận chạm: chặn chạm lọt xuống màn hình chính */
    lv_obj_add_flag(s_ac_panel, LV_OBJ_FLAG_HIDDEN);

    s_ac_title = make_label(s_ac_panel, &node_font_vi_24, PAD, 12, "Điều hòa", COLOR_TEXT);
    lv_obj_t *close = make_button(s_ac_panel, width - PAD - 110, 6, 110, 40, "Đóng", &node_font_vi_16, COLOR_TILE,
                                  &s_ac_close_label);
    lv_obj_add_event_cb(close, ac_button_cb, LV_EVENT_CLICKED, (void *)(intptr_t)AC_BTN_CLOSE);

    /* Điều khiển: [-]  26 °C  [+] / trạng thái / [BẬT] [TẮT] [HỌC MÃ] */
    lv_coord_t view_h = AC_MSG_Y - AC_TITLE_H - 6;
    s_ac_ctrl = make_view(s_ac_panel, width, view_h);
    lv_obj_t *b = make_button(s_ac_ctrl, PAD + 24, 4, AC_STEP_BTN, AC_STEP_BTN, "-", FONT_BIG, COLOR_TILE, NULL);
    lv_obj_add_event_cb(b, ac_button_cb, LV_EVENT_CLICKED, (void *)(intptr_t)AC_BTN_MINUS);
    b = make_button(s_ac_ctrl, width - PAD - 24 - AC_STEP_BTN, 4, AC_STEP_BTN, AC_STEP_BTN, "+", FONT_BIG, COLOR_TILE,
                    NULL);
    lv_obj_add_event_cb(b, ac_button_cb, LV_EVENT_CLICKED, (void *)(intptr_t)AC_BTN_PLUS);
    s_ac_temp_val = make_label(s_ac_ctrl, FONT_BIG, width / 2 - 44, 14, "", COLOR_TEXT);   /* 2 chữ số ≈ 52 px */
    make_label(s_ac_ctrl, &node_font_vi_24, width / 2 + 14, 26, "°C", COLOR_MUTED);
    ac_show_temp();

    s_ac_power_lbl = make_label(s_ac_ctrl, &node_font_vi_16, 0, 88, "", COLOR_MUTED);
    lv_obj_set_width(s_ac_power_lbl, width);
    lv_obj_set_style_text_align(s_ac_power_lbl, LV_TEXT_ALIGN_CENTER, 0);

    static const char *const names[3] = {"BẬT", "TẮT", "HỌC MÃ"};
    static const int ids[3] = {AC_BTN_ON, AC_BTN_OFF, AC_BTN_LEARN};
    lv_coord_t bw = (width - 2 * PAD - 2 * 12) / 3;
    for (int i = 0; i < 3; i++) {
        b = make_button(s_ac_ctrl, PAD + (lv_coord_t)i * (bw + 12), 120, bw, AC_BTN_H, names[i], &node_font_vi_24,
                        i == 0 ? COLOR_ACCENT : COLOR_TILE, NULL);
        lv_obj_add_event_cb(b, ac_button_cb, LV_EVENT_CLICKED, (void *)(intptr_t)ids[i]);
    }

    /* Học mã: lưới 4×4 — TẮT, 16..30°C */
    s_ac_learn = make_view(s_ac_panel, width, view_h);
    lv_obj_add_flag(s_ac_learn, LV_OBJ_FLAG_HIDDEN);
    lv_coord_t sw = (width - 2 * PAD - (AC_SLOT_COLS - 1) * DEV_GAP) / AC_SLOT_COLS;
    for (int i = 0; i < AC_SLOT_COUNT; i++) {
        char text[12];
        if (i == 0) {
            strlcpy(text, "TẮT", sizeof(text));
        } else {
            snprintf(text, sizeof(text), "%d°C", ac_slot_temp(i));
        }
        lv_coord_t x = PAD + (lv_coord_t)(i % AC_SLOT_COLS) * (sw + DEV_GAP);
        lv_coord_t y = (lv_coord_t)(i / AC_SLOT_COLS) * (AC_SLOT_H + DEV_GAP);
        s_ac_slot_btn[i] = make_button(s_ac_learn, x, y, sw, AC_SLOT_H, text, &node_font_vi_16, COLOR_TILE,
                                       &s_ac_slot_lbl[i]);
        lv_obj_add_event_cb(s_ac_slot_btn[i], ac_slot_cb, LV_EVENT_SHORT_CLICKED, (void *)(intptr_t)i);
        lv_obj_add_event_cb(s_ac_slot_btn[i], ac_slot_cb, LV_EVENT_LONG_PRESSED, (void *)(intptr_t)i);
    }
    ac_render_slots();

    s_ac_msg = make_label(s_ac_panel, &node_font_vi_16, PAD, AC_MSG_Y, "", COLOR_MUTED);
    lv_obj_set_width(s_ac_msg, width - 2 * PAD);
    lv_label_set_long_mode(s_ac_msg, LV_LABEL_LONG_WRAP);   /* tối đa 3 dòng tới đáy màn hình */

    s_ac_temp_timer = lv_timer_create(ac_temp_timer_cb, AC_TEMP_DEBOUNCE_MS, NULL);
    lv_timer_pause(s_ac_temp_timer);
}

static void build_devices(lv_obj_t *scr, lv_coord_t width)
{
    static const char *const names[NODE_UI_DEV_COUNT] = {"Đèn", "Quạt", "Rèm cửa", "Điều hòa"};
    lv_coord_t tile_w = (width - 2 * PAD - (NODE_UI_DEV_COUNT - 1) * DEV_GAP) / NODE_UI_DEV_COUNT;   /* 106 */
    for (int i = 0; i < NODE_UI_DEV_COUNT; i++) {
        s_dev_tile[i] = make_tile(scr, PAD + (lv_coord_t)i * (tile_w + DEV_GAP), DEV_Y, tile_w, DEV_H);
        make_label(s_dev_tile[i], &node_font_vi_16, DEV_PAD, 8, names[i], COLOR_MUTED);
        s_dev_state[i] = make_label(s_dev_tile[i], &node_font_vi_24, DEV_PAD, 34, "--", COLOR_MUTED);
        s_dev_sub[i] = make_label(s_dev_tile[i], &node_font_vi_16, DEV_PAD, 68, "", COLOR_MUTED);
        lv_obj_set_width(s_dev_sub[i], tile_w - 2 * DEV_PAD);
        lv_label_set_long_mode(s_dev_sub[i], LV_LABEL_LONG_DOT);
        render_device(i);
    }
    /* Ô Điều hòa nhận chạm (mở bảng); BUBBLE để chấm kiểm tra cảm ứng vẫn chạy khi chạm lên ô. */
    lv_obj_add_flag(s_dev_tile[NODE_UI_DEV_AC], LV_OBJ_FLAG_CLICKABLE | LV_OBJ_FLAG_EVENT_BUBBLE);
    lv_obj_add_event_cb(s_dev_tile[NODE_UI_DEV_AC], ac_tile_cb, LV_EVENT_CLICKED, NULL);
}

static void build_screen(void)
{
    lv_obj_t *scr = lv_scr_act();
    lv_obj_set_style_bg_color(scr, COLOR_BG, 0);
    lv_obj_set_style_bg_opa(scr, LV_OPA_COVER, 0);
    lv_obj_clear_flag(scr, LV_OBJ_FLAG_SCROLLABLE);
    lv_obj_add_event_cb(scr, screen_event_cb, LV_EVENT_ALL, NULL);
    lv_coord_t width = lv_obj_get_width(scr);

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
    build_devices(scr, width);

    /* Thanh dưới: toạ độ chạm (kiểm hiệu chuẩn cảm ứng). */
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

    build_ac_panel(scr, width, lv_obj_get_height(scr));
    render_device(NODE_UI_DEV_AC);   /* dòng trạng thái của bảng */

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
        lv_label_set_text(s_climate_status, LV_SYMBOL_WARNING " Không đọc được cảm biến: kiểm dây SDA, SCL, 3V3, GND");
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

void node_ui_set_device(node_ui_dev_t dev, int state)
{
    if ((unsigned)dev >= NODE_UI_DEV_COUNT || s_dev_tile[dev] == NULL || !drv_display_lock(-1)) {
        return;
    }
    s_dev_val[dev] = state < 0 ? NODE_UI_STATE_UNKNOWN : state;
    render_device(dev);
    drv_display_unlock();
}

void node_ui_set_ac_setpoint(float setpoint_c)
{
    if (s_dev_tile[NODE_UI_DEV_AC] == NULL || !drv_display_lock(-1)) {
        return;
    }
    s_ac_setpoint = setpoint_c;
    /* Đang chờ gửi nhiệt độ người dùng vừa chỉnh thì giữ số trên bảng; còn lại hiện số đã xác nhận. */
    if (!isnan(setpoint_c) && !s_ac_temp_pending && s_ac_temp_val != NULL) {
        s_ac_ui_temp = (int)lroundf(setpoint_c);
        ac_show_temp();
    }
    render_device(NODE_UI_DEV_AC);
    drv_display_unlock();
}

void node_ui_set_ac_callbacks(const node_ui_ac_callbacks_t *cbs)
{
    if (cbs == NULL || !drv_display_lock(-1)) {
        return;
    }
    s_ac_cbs = *cbs;
    drv_display_unlock();
}

void node_ui_set_ac_learned(uint32_t mask)
{
    if (s_ac_panel == NULL || !drv_display_lock(-1)) {
        return;
    }
    s_ac_learned = mask;
    ac_render_slots();
    drv_display_unlock();
}

void node_ui_set_ac_message(node_ui_msg_t level, const char *text)
{
    if (s_ac_msg == NULL || text == NULL || !drv_display_lock(-1)) {
        return;
    }
    ac_set_msg(level, text);
    drv_display_unlock();
}
