#include "node_ui.h"

#include <math.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <time.h>

#include "drv_display.h"
#include "esp_check.h"
#include "lvgl.h"
#include "sdkconfig.h"

static const char *TAG = "node_ui";

LV_FONT_DECLARE(node_font_vi_16);
LV_FONT_DECLARE(node_font_vi_24);

/* Cùng bảng màu với gw_ui.c của Gateway. */
#define COLOR_BG lv_color_hex(0x10151b)
#define COLOR_TILE lv_color_hex(0x252f3b)
#define COLOR_TILE_ON lv_color_hex(0x173a2a)        /* ô thiết bị đang bật/mở */
#define COLOR_TILE_PRESSED lv_color_hex(0x334155)   /* ô thiết bị đang bị ấn */
#define COLOR_CHIP lv_color_hex(0x3a4656)           /* nút mức / nút phụ chưa chọn */
#define COLOR_SWITCH_OFF lv_color_hex(0x4b5868)
#define COLOR_ACCENT lv_color_hex(0x2563eb)
#define COLOR_TEXT lv_color_hex(0xe8edf2)
#define COLOR_MUTED lv_color_hex(0x8a96a3)
#define COLOR_OK lv_color_hex(0x3ecf8e)
#define COLOR_WARN lv_color_hex(0xf5b942)
#define COLOR_BAD lv_color_hex(0xf06a5b)

/* Số lớn: Montserrat 40 có sẵn của LVGL (chỉ cần chữ số, dấu chấm, "--", "%"), như FONT_BIG của Gateway. */
#define FONT_BIG (&lv_font_montserrat_40)

/* Bố cục theo chiều cao 320 (ngang); chiều rộng tính theo lv_obj_get_width. */
#define PAD 16
#define LINK_DOT 12
#define CLIMATE_Y 44
#define CLIMATE_H 76
#define GRID_Y 128
#define TILE_H 76
#define TILE_GAP 8
#define TILE_PAD 12
#define SW_W 52
#define SW_H 28
#define SW_TOUCH_EXT 6    /* vùng chạm nới thêm quanh công tắc; đáy (8+28+6 = 42) không chạm nút mức rèm ở CHIP_Y */
#define CHIP_Y 44
#define CHIP_W 92
#define CHIP_H 28
#define CHIP_GAP 12
#define FOOT_Y 292
#define NOTICE_MS 5000
#define CLOCK_VALID_TS 1700000000   /* đồng hồ hệ thống nhỏ hơn mốc này = chưa được Gateway cấp giờ */

/* Bảng (Điều hòa, Rèm): phủ kín màn hình. */
#define PANEL_TITLE_H 52
#define PANEL_MSG_Y 240
#define AC_STEP_W 76
#define AC_STEP_H 60
#define AC_SLOT_COUNT (1 + NODE_UI_AC_TEMP_MAX - NODE_UI_AC_TEMP_MIN + 1)   /* TẮT + 16..30 = 16 ô */
#define AC_SLOT_COLS 4
#define AC_SLOT_H 40
#define AC_TEMP_DEBOUNCE_MS 600
#define AC_DEFAULT_TEMP 26
#define AC_LEARN_TICK_MS 100

enum { CLIMATE_TEMP, CLIMATE_HUMI, CLIMATE_COUNT };
enum { SENSOR_SEARCHING, SENSOR_OK, SENSOR_ERROR };

static const int CURTAIN_LEVELS[] = {50, 100};   /* đóng = gạt công tắc sang tắt */
#define CURTAIN_LEVEL_COUNT (sizeof(CURTAIN_LEVELS) / sizeof(CURTAIN_LEVELS[0]))

/* ---- màn hình chính ---- */
static lv_obj_t *s_climate_val[CLIMATE_COUNT];
static lv_obj_t *s_date_label;
static lv_obj_t *s_link_dot;
static lv_obj_t *s_link_icon;
static lv_obj_t *s_notice_label;
static lv_obj_t *s_dev_tile[NODE_UI_DEV_COUNT];
static lv_obj_t *s_dev_switch[NODE_UI_DEV_COUNT];
static lv_obj_t *s_dev_sub[NODE_UI_DEV_COUNT];   /* rèm: nhãn trạng thái cạnh tên */
static lv_obj_t *s_cur_chip[CURTAIN_LEVEL_COUNT];
#if CONFIG_NODE_UI_TOUCH_TEST
static lv_obj_t *s_dot;
#endif

/* Chỉ đọc/ghi khi giữ khoá LVGL. */
static int s_dev_val[NODE_UI_DEV_COUNT] = {NODE_UI_STATE_UNKNOWN, NODE_UI_STATE_UNKNOWN, NODE_UI_STATE_UNKNOWN,
                                           NODE_UI_STATE_UNKNOWN};
static node_ui_switch_callbacks_t s_sw_cbs;
static int s_sensor_state = SENSOR_SEARCHING;
static bool s_notice_active;
static uint32_t s_notice_tick;
static node_ui_msg_t s_notice_level;
static char s_notice_text[96];
static char s_date_text[48];

/* ---- bảng Điều hòa ---- */
enum { AC_BTN_BACK, AC_BTN_LEARN, AC_BTN_MINUS, AC_BTN_PLUS };

static lv_obj_t *s_ac_panel;
static lv_obj_t *s_ac_title;
static lv_obj_t *s_ac_learn_btn;
static lv_obj_t *s_ac_ctrl;
static lv_obj_t *s_ac_learn;
static lv_obj_t *s_ac_power_sw;
static lv_obj_t *s_ac_power_lbl;
static lv_obj_t *s_ac_temp_val;
static lv_obj_t *s_ac_room_lbl;
static lv_obj_t *s_ac_slider;
static lv_obj_t *s_ac_msg;
static lv_obj_t *s_ac_slot_btn[AC_SLOT_COUNT];
static lv_obj_t *s_ac_slot_lbl[AC_SLOT_COUNT];
static lv_obj_t *s_ac_count_lbl;
static lv_obj_t *s_ac_count_bar;
static lv_timer_t *s_ac_temp_timer;    /* gộp các lần bấm - / + / kéo thanh; đang chạy = có nhiệt độ chưa gửi */
static lv_timer_t *s_ac_learn_timer;   /* đếm ngược lúc chờ remote */
static bool s_ac_temp_pending;
static int s_ac_ui_temp = AC_DEFAULT_TEMP;
static float s_ac_setpoint = NAN;
static uint32_t s_ac_learned;
static int s_ac_learning_idx = -1;     /* ô đang chờ remote; -1 = không */
static uint32_t s_ac_learn_start;
static uint32_t s_ac_learn_ms;
static node_ui_ac_callbacks_t s_ac_cbs;

/* ---- bảng Rèm cửa ---- */
enum { CUR_BTN_BACK, CUR_BTN_STOP, CUR_BTN_MARK_CLOSED, CUR_BTN_MARK_OPEN };

static lv_obj_t *s_cur_panel;
static lv_obj_t *s_cur_pct;
static lv_obj_t *s_cur_status;
static lv_obj_t *s_cur_info;
static lv_obj_t *s_cur_msg;
static node_ui_curtain_callbacks_t s_cur_cbs;
static int s_cur_percent = -1;   /* -1 = chưa biết */
static int s_cur_target;
static bool s_cur_moving;
static int32_t s_cur_position;
static int32_t s_cur_travel;
static bool s_cur_calibrated;

/* ---- tiện ích dựng đối tượng -------------------------------------------------------------------------- */

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

/* Ô nền bo góc, mặc định không nhận chạm. */
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

static lv_obj_t *make_button(lv_obj_t *parent, lv_coord_t x, lv_coord_t y, lv_coord_t w, lv_coord_t h, const char *text,
                             const lv_font_t *font, lv_color_t bg, lv_obj_t **label_out)
{
    lv_obj_t *b = lv_btn_create(parent);
    lv_obj_set_pos(b, x, y);
    lv_obj_set_size(b, w, h);
    lv_obj_set_style_bg_color(b, bg, 0);
    lv_obj_set_style_radius(b, 10, 0);
    lv_obj_set_style_shadow_width(b, 0, 0);
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

/* Công tắc gạt: xám khi tắt, xanh khi bật; vùng chạm nới rộng cho màn cảm ứng điện trở. */
static lv_obj_t *make_switch(lv_obj_t *parent, lv_coord_t x, lv_coord_t y, lv_coord_t w, lv_coord_t h)
{
    lv_obj_t *sw = lv_switch_create(parent);
    lv_obj_set_pos(sw, x, y);
    lv_obj_set_size(sw, w, h);
    lv_obj_set_style_bg_color(sw, COLOR_SWITCH_OFF, LV_PART_MAIN);
    lv_obj_set_style_bg_color(sw, COLOR_OK, LV_PART_INDICATOR | LV_STATE_CHECKED);
    lv_obj_set_ext_click_area(sw, SW_TOUCH_EXT);
    return sw;
}

/* Đặt công tắc theo trạng thái đã xác nhận (không sinh sự kiện VALUE_CHANGED). usable = false: mờ, không gạt được. */
static void switch_show(lv_obj_t *sw, bool usable, bool on)
{
    if (on) {
        lv_obj_add_state(sw, LV_STATE_CHECKED);
    } else {
        lv_obj_clear_state(sw, LV_STATE_CHECKED);
    }
    if (usable) {
        lv_obj_clear_state(sw, LV_STATE_DISABLED);
    } else {
        lv_obj_add_state(sw, LV_STATE_DISABLED);
    }
}

static lv_obj_t *make_panel(lv_obj_t *scr, lv_coord_t width, lv_coord_t height)
{
    lv_obj_t *p = lv_obj_create(scr);
    lv_obj_remove_style_all(p);
    lv_obj_set_size(p, width, height);
    lv_obj_set_style_bg_color(p, COLOR_BG, 0);
    lv_obj_set_style_bg_opa(p, LV_OPA_COVER, 0);
    lv_obj_clear_flag(p, LV_OBJ_FLAG_SCROLLABLE);   /* vẫn nhận chạm: chặn chạm lọt xuống màn hình chính */
    lv_obj_add_flag(p, LV_OBJ_FLAG_HIDDEN);
    return p;
}

static lv_obj_t *make_view(lv_obj_t *parent, lv_coord_t width, lv_coord_t height)
{
    lv_obj_t *v = lv_obj_create(parent);
    lv_obj_remove_style_all(v);
    lv_obj_set_pos(v, 0, PANEL_TITLE_H);
    lv_obj_set_size(v, width, height);
    lv_obj_clear_flag(v, LV_OBJ_FLAG_CLICKABLE | LV_OBJ_FLAG_SCROLLABLE);
    return v;
}

static lv_color_t msg_color(node_ui_msg_t level)
{
    static const uint32_t colors[] = {0x8a96a3, 0x3ecf8e, 0xf5b942, 0xf06a5b};
    return lv_color_hex(colors[level <= NODE_UI_MSG_BAD ? level : 0]);
}

static void set_msg(lv_obj_t *label, node_ui_msg_t level, const char *text)
{
    lv_label_set_text(label, text);
    lv_obj_set_style_text_color(label, msg_color(level), 0);
}

/* ---- dòng thông báo + ngày giờ ------------------------------------------------------------------------ */

/* Thông báo tạm (5 s) nếu có; không thì trạng thái cảm biến. Giữ khoá LVGL. */
static void render_footer(void)
{
    if (s_notice_label == NULL) {
        return;
    }
    if (s_notice_active) {
        set_msg(s_notice_label, s_notice_level, s_notice_text);
    } else if (s_sensor_state == SENSOR_ERROR) {
        set_msg(s_notice_label, NODE_UI_MSG_BAD, LV_SYMBOL_WARNING " Không đọc được cảm biến: kiểm dây SDA, SCL, 3V3, GND");
    } else if (s_sensor_state == SENSOR_SEARCHING) {
        set_msg(s_notice_label, NODE_UI_MSG_INFO, "Đang tìm cảm biến nhiệt độ, độ ẩm...");
    } else {
        set_msg(s_notice_label, NODE_UI_MSG_INFO, "Sẵn sàng");
    }
}

/* Mỗi giây: ngày giờ ở tiêu đề (đồng hồ hệ thống, múi giờ do application đặt) + hết hạn thông báo tạm. */
static void tick_cb(lv_timer_t *t)
{
    (void)t;
    char text[sizeof(s_date_text)];
    time_t now = time(NULL);
    if (now >= CLOCK_VALID_TS) {
        static const char *const days[7] = {"CN", "Th 2", "Th 3", "Th 4", "Th 5", "Th 6", "Th 7"};
        struct tm tm;
        localtime_r(&now, &tm);
        snprintf(text, sizeof(text), "%s, %02d/%02d/%04d  %02d:%02d", days[tm.tm_wday % 7], tm.tm_mday, tm.tm_mon + 1,
                 tm.tm_year + 1900, tm.tm_hour, tm.tm_min);
    } else {
        strlcpy(text, "--/--/----  --:--", sizeof(text));   /* chưa nối Gateway nên chưa có giờ */
    }
    if (strcmp(text, s_date_text) != 0) {
        strlcpy(s_date_text, text, sizeof(s_date_text));
        lv_label_set_text(s_date_label, s_date_text);
    }
    if (s_notice_active && lv_tick_elaps(s_notice_tick) >= NOTICE_MS) {
        s_notice_active = false;
        render_footer();
    }
}

#if CONFIG_NODE_UI_TOUCH_TEST
/* [Kiểm hiệu chuẩn cảm ứng] chấm xanh chạy theo ngón tay + toạ độ ở dòng thông báo (chạm vào chỗ trống của màn hình). */
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
    lv_obj_set_pos(s_dot, p.x - 8, p.y - 8);
    snprintf(s_notice_text, sizeof(s_notice_text), "Chạm: x = %d, y = %d", (int)p.x, (int)p.y);
    s_notice_level = NODE_UI_MSG_INFO;
    s_notice_active = true;
    s_notice_tick = lv_tick_get();
    render_footer();
}
#endif

/* ---- 4 ô thiết bị ------------------------------------------------------------------------------------- */

/* Thiết bị có dùng được không (application đã đặt callback = phần cứng bật trong menuconfig và khởi tạo xong). */
static bool dev_usable(int i)
{
    switch (i) {
    case NODE_UI_DEV_LAMP:
    case NODE_UI_DEV_FAN:
        return s_sw_cbs.on_set != NULL;
    case NODE_UI_DEV_CURTAIN:
        return s_cur_cbs.on_op != NULL;
    case NODE_UI_DEV_AC:
        return s_ac_cbs.on_power != NULL;
    default:
        return false;
    }
}

/* Mức rèm đang "có hiệu lực" trên giao diện: đích khi đang chạy, vị trí khi đứng yên. */
static int curtain_shown_level(void)
{
    return s_cur_moving ? s_cur_target : s_cur_percent;
}

/* Vẽ lại ô Đèn / Quạt / Điều hòa theo s_dev_val (giữ khoá LVGL). */
static void render_device(int i)
{
    if (s_dev_tile[i] == NULL || i == NODE_UI_DEV_CURTAIN) {
        return;
    }
    const bool usable = dev_usable(i);
    const int st = s_dev_val[i];
    const bool on = usable && st > 0;

    switch_show(s_dev_switch[i], usable, on);
    /* Công tắc + nền xanh đã cho biết bật/tắt: dòng phụ chỉ còn thông tin công tắc không nói được. */
    char sub[32] = "";
    if (!usable) {
        strlcpy(sub, "Chưa lắp", sizeof(sub));
    } else if (i == NODE_UI_DEV_AC && on && !isnan(s_ac_setpoint)) {
        snprintf(sub, sizeof(sub), "Đặt %.0f°C", (double)s_ac_setpoint);
    }
    lv_label_set_text(s_dev_sub[i], sub);
    lv_obj_set_style_text_color(s_dev_sub[i], on ? COLOR_OK : COLOR_MUTED, 0);
    lv_obj_set_style_bg_color(s_dev_tile[i], on ? COLOR_TILE_ON : COLOR_TILE, 0);

    if (i == NODE_UI_DEV_AC && s_ac_power_sw != NULL) {
        switch_show(s_ac_power_sw, usable, on);
        lv_label_set_text(s_ac_power_lbl, st == NODE_UI_STATE_UNKNOWN ? "Chưa rõ trạng thái: gạt công tắc để bật"
                                          : on                        ? "Đang bật, chế độ làm lạnh"
                                                                      : "Đang tắt");
        lv_obj_set_style_text_color(s_ac_power_lbl, on ? COLOR_OK : COLOR_MUTED, 0);
    }
}

/* Vẽ lại ô Rèm cửa + bảng Rèm theo s_cur_* (giữ khoá LVGL). */
static void render_curtain(void)
{
    if (s_dev_tile[NODE_UI_DEV_CURTAIN] == NULL) {
        return;
    }
    const bool usable = dev_usable(NODE_UI_DEV_CURTAIN);
    const bool known = usable && s_cur_percent >= 0;
    const int level = curtain_shown_level();
    const bool on = known && level > 0;
    char text[64];

    switch_show(s_dev_switch[NODE_UI_DEV_CURTAIN], usable, on);
    for (size_t i = 0; i < CURTAIN_LEVEL_COUNT; i++) {
        const bool active = known && abs(level - CURTAIN_LEVELS[i]) <= 1;
        lv_obj_set_style_bg_color(s_cur_chip[i], active ? COLOR_ACCENT : COLOR_CHIP, 0);
        if (usable) {
            lv_obj_clear_state(s_cur_chip[i], LV_STATE_DISABLED);
        } else {
            lv_obj_add_state(s_cur_chip[i], LV_STATE_DISABLED);
        }
    }
    /* Công tắc + nền xanh + nút mức tô xanh dương đã cho biết vị trí: chỉ báo khi chưa lắp hoặc đang chạy. */
    if (!usable) {
        strlcpy(text, "Chưa lắp", sizeof(text));
    } else if (s_cur_moving) {
        strlcpy(text, "Đang chạy", sizeof(text));
    } else {
        text[0] = '\0';
    }
    lv_label_set_text(s_dev_sub[NODE_UI_DEV_CURTAIN], text);
    lv_obj_set_style_text_color(s_dev_sub[NODE_UI_DEV_CURTAIN], s_cur_moving ? COLOR_WARN : on ? COLOR_OK : COLOR_MUTED, 0);
    lv_obj_set_style_bg_color(s_dev_tile[NODE_UI_DEV_CURTAIN], on ? COLOR_TILE_ON : COLOR_TILE, 0);

    if (s_cur_panel == NULL) {
        return;
    }
    if (s_cur_percent < 0) {
        strlcpy(text, "--%", sizeof(text));
    } else {
        snprintf(text, sizeof(text), "%d%%", s_cur_percent);
    }
    lv_label_set_text(s_cur_pct, text);
    const char *status;
    lv_color_t color;
    if (s_cur_moving) {
        status = s_cur_target > s_cur_percent ? "Đang mở..." : "Đang đóng...";
        color = COLOR_WARN;
    } else if (s_cur_percent < 0) {
        status = "Chưa rõ vị trí";
        color = COLOR_MUTED;
    } else if (s_cur_percent == 0) {
        status = "Đóng hẳn";
        color = COLOR_TEXT;
    } else if (s_cur_percent >= 100) {
        status = "Mở hẳn";
        color = COLOR_OK;
    } else {
        status = "Mở một phần";
        color = COLOR_OK;
    }
    lv_label_set_text(s_cur_status, status);
    lv_obj_set_style_text_color(s_cur_status, color, 0);
    snprintf(text, sizeof(text), "Vị trí %ld / %ld bước%s", (long)s_cur_position, (long)s_cur_travel,
             s_cur_calibrated ? "" : " (chưa hiệu chuẩn)");
    lv_label_set_text(s_cur_info, text);
}

static void render_all_devices(void)
{
    for (int i = 0; i < NODE_UI_DEV_COUNT; i++) {
        render_device(i);
    }
    render_curtain();
}

/* ---- bảng Điều hòa ------------------------------------------------------------------------------------ */

static int ac_slot_temp(int idx)   /* ô 0 = TẮT, ô 1..15 = 16..30°C */
{
    return idx == 0 ? NODE_UI_AC_SLOT_OFF : NODE_UI_AC_TEMP_MIN + idx - 1;
}

static int ac_slot_index(int slot)
{
    return slot == NODE_UI_AC_SLOT_OFF ? 0 : slot - (NODE_UI_AC_TEMP_MIN - 1);
}

static bool ac_temp_learned(int temp)
{
    return (s_ac_learned >> ac_slot_index(temp)) & 1u;
}

/* Số nhiệt độ trên bảng: vàng nếu mức này chưa học mã. Thanh kéo theo số, trừ khi đang bị kéo. */
static void ac_show_temp(void)
{
    lv_label_set_text_fmt(s_ac_temp_val, "%d", s_ac_ui_temp);
    lv_obj_set_style_text_color(s_ac_temp_val, ac_temp_learned(s_ac_ui_temp) ? COLOR_TEXT : COLOR_WARN, 0);
    if (!lv_obj_has_state(s_ac_slider, LV_STATE_PRESSED)) {
        lv_slider_set_value(s_ac_slider, s_ac_ui_temp, LV_ANIM_OFF);
    }
}

static void ac_render_slots(void)
{
    char text[20];
    for (int i = 0; i < AC_SLOT_COUNT; i++) {
        bool learned = (s_ac_learned >> i) & 1u;
        if (i == 0) {
            snprintf(text, sizeof(text), "TẮT%s", learned ? " " LV_SYMBOL_OK : "");
        } else {
            snprintf(text, sizeof(text), "%d°C%s", ac_slot_temp(i), learned ? " " LV_SYMBOL_OK : "");
        }
        lv_label_set_text(s_ac_slot_lbl[i], text);
        lv_obj_set_style_bg_color(s_ac_slot_btn[i], learned ? COLOR_TILE_ON : COLOR_TILE, 0);
        lv_obj_set_style_text_color(s_ac_slot_lbl[i], learned ? COLOR_OK : COLOR_TEXT, 0);
    }
}

static void ac_show_learn(bool learn)
{
    if (learn) {
        lv_obj_add_flag(s_ac_ctrl, LV_OBJ_FLAG_HIDDEN);
        lv_obj_add_flag(s_ac_learn_btn, LV_OBJ_FLAG_HIDDEN);
        lv_obj_clear_flag(s_ac_learn, LV_OBJ_FLAG_HIDDEN);
        lv_label_set_text(s_ac_title, "Học mã remote");
        set_msg(s_ac_msg, NODE_UI_MSG_INFO,
                "Chạm 1 ô, chĩa remote vào mắt thu (cách 5-20 cm), bấm remote trong 10 giây. Ô 16..30: remote ở chế độ "
                "Lạnh, đúng nhiệt độ đó. Giữ lâu ô có dấu tích để phát thử.");
    } else {
        lv_obj_add_flag(s_ac_learn, LV_OBJ_FLAG_HIDDEN);
        lv_obj_clear_flag(s_ac_ctrl, LV_OBJ_FLAG_HIDDEN);
        lv_obj_clear_flag(s_ac_learn_btn, LV_OBJ_FLAG_HIDDEN);
        lv_label_set_text(s_ac_title, "Điều hòa");
        set_msg(s_ac_msg, NODE_UI_MSG_INFO,
                s_ac_learned == 0 ? "Chưa có mã nào: bấm Học mã để thu tín hiệu remote điều hòa."
                                  : "Gạt công tắc để bật / tắt; bấm - / + hoặc kéo thanh để đổi nhiệt độ.");
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

/* Người dùng chọn nhiệt độ mới (nút - / + hoặc thanh kéo): mức đã học thì gửi sau 600 ms, chưa học thì chỉ nhắc. */
static void ac_pick_temp(int temp)
{
    if (temp < NODE_UI_AC_TEMP_MIN || temp > NODE_UI_AC_TEMP_MAX) {
        return;
    }
    s_ac_ui_temp = temp;
    ac_show_temp();
    if (ac_temp_learned(temp)) {
        s_ac_temp_pending = true;
        lv_timer_reset(s_ac_temp_timer);
        lv_timer_resume(s_ac_temp_timer);
        return;
    }
    s_ac_temp_pending = false;
    lv_timer_pause(s_ac_temp_timer);
    char msg[120];
    snprintf(msg, sizeof(msg), "Chưa học mã %d°C: bấm Học mã, chạm ô %d°C rồi bấm remote ở đúng nhiệt độ đó.", temp, temp);
    set_msg(s_ac_msg, NODE_UI_MSG_WARN, msg);
}

static void ac_button_cb(lv_event_t *e)
{
    switch ((int)(intptr_t)lv_event_get_user_data(e)) {
    case AC_BTN_BACK:
        if (!lv_obj_has_flag(s_ac_learn, LV_OBJ_FLAG_HIDDEN)) {
            ac_show_learn(false);
        } else {
            lv_obj_add_flag(s_ac_panel, LV_OBJ_FLAG_HIDDEN);
        }
        break;
    case AC_BTN_LEARN:
        ac_show_learn(true);
        break;
    case AC_BTN_MINUS:
        ac_pick_temp(s_ac_ui_temp - 1);
        break;
    case AC_BTN_PLUS:
        ac_pick_temp(s_ac_ui_temp + 1);
        break;
    default:
        break;
    }
}

static void ac_slider_cb(lv_event_t *e)
{
    (void)e;
    ac_pick_temp((int)lv_slider_get_value(s_ac_slider));
}

/* Công tắc nguồn (trên ô Điều hòa và trên bảng): application phát IR rồi đẩy trạng thái thật về. */
static void ac_power_cb(lv_event_t *e)
{
    bool on = lv_obj_has_state(lv_event_get_target(e), LV_STATE_CHECKED);
    if (s_ac_cbs.on_power != NULL) {
        s_ac_cbs.on_power(on, s_ac_cbs.ctx);
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

static void ac_learning_stop(void)
{
    if (s_ac_learning_idx >= 0) {
        lv_obj_set_style_border_width(s_ac_slot_btn[s_ac_learning_idx], 0, 0);
    }
    s_ac_learning_idx = -1;
    lv_timer_pause(s_ac_learn_timer);
    lv_obj_add_flag(s_ac_count_lbl, LV_OBJ_FLAG_HIDDEN);
    lv_obj_add_flag(s_ac_count_bar, LV_OBJ_FLAG_HIDDEN);
}

/* 100 ms/lần khi đang chờ remote: số giây còn lại, thanh đếm ngược, viền ô đang học nháy. */
static void ac_learn_timer_cb(lv_timer_t *t)
{
    (void)t;
    if (s_ac_learning_idx < 0) {
        return;
    }
    uint32_t elapsed = lv_tick_elaps(s_ac_learn_start);
    uint32_t left = elapsed >= s_ac_learn_ms ? 0 : s_ac_learn_ms - elapsed;
    lv_label_set_text_fmt(s_ac_count_lbl, "Còn %d giây", (int)((left + 999) / 1000));
    lv_bar_set_value(s_ac_count_bar, (int32_t)(left * 100 / s_ac_learn_ms), LV_ANIM_OFF);
    lv_obj_set_style_border_width(s_ac_slot_btn[s_ac_learning_idx], (elapsed / 300) % 2 == 0 ? 3 : 0, 0);
}

static void ac_tile_cb(lv_event_t *e)
{
    (void)e;
    ac_show_learn(false);
    lv_obj_clear_flag(s_ac_panel, LV_OBJ_FLAG_HIDDEN);
}

static void build_ac_panel(lv_obj_t *scr, lv_coord_t width, lv_coord_t height)
{
    s_ac_panel = make_panel(scr, width, height);
    s_ac_title = make_label(s_ac_panel, &node_font_vi_24, PAD, 12, "Điều hòa", COLOR_TEXT);
    lv_obj_t *b = make_button(s_ac_panel, width - PAD - 110, 6, 110, 40, "Quay lại", &node_font_vi_16, COLOR_CHIP, NULL);
    lv_obj_add_event_cb(b, ac_button_cb, LV_EVENT_CLICKED, (void *)(intptr_t)AC_BTN_BACK);
    s_ac_learn_btn = make_button(s_ac_panel, width - PAD - 110 - 8 - 110, 6, 110, 40, "Học mã", &node_font_vi_16,
                                 COLOR_CHIP, NULL);
    lv_obj_add_event_cb(s_ac_learn_btn, ac_button_cb, LV_EVENT_CLICKED, (void *)(intptr_t)AC_BTN_LEARN);

    /* Điều khiển: [Nguồn ... công tắc] / [-]  26 °C  [+] + nhiệt độ phòng / thanh kéo 16..30 */
    lv_coord_t view_h = PANEL_MSG_Y - PANEL_TITLE_H - 4;
    s_ac_ctrl = make_view(s_ac_panel, width, view_h);
    lv_obj_t *power = make_tile(s_ac_ctrl, PAD, 2, width - 2 * PAD, 54);
    make_label(power, &node_font_vi_16, TILE_PAD, 6, "Nguồn", COLOR_MUTED);
    s_ac_power_lbl = make_label(power, &node_font_vi_16, TILE_PAD, 28, "", COLOR_MUTED);
    s_ac_power_sw = make_switch(power, width - 2 * PAD - TILE_PAD - 60, 12, 60, 30);
    lv_obj_add_event_cb(s_ac_power_sw, ac_power_cb, LV_EVENT_VALUE_CHANGED, NULL);

    b = make_button(s_ac_ctrl, PAD + 24, 64, AC_STEP_W, AC_STEP_H, "-", FONT_BIG, COLOR_CHIP, NULL);
    lv_obj_add_event_cb(b, ac_button_cb, LV_EVENT_CLICKED, (void *)(intptr_t)AC_BTN_MINUS);
    b = make_button(s_ac_ctrl, width - PAD - 24 - AC_STEP_W, 64, AC_STEP_W, AC_STEP_H, "+", FONT_BIG, COLOR_CHIP, NULL);
    lv_obj_add_event_cb(b, ac_button_cb, LV_EVENT_CLICKED, (void *)(intptr_t)AC_BTN_PLUS);
    s_ac_temp_val = make_label(s_ac_ctrl, FONT_BIG, width / 2 - 44, 60, "", COLOR_TEXT);   /* 2 chữ số ≈ 52 px */
    make_label(s_ac_ctrl, &node_font_vi_24, width / 2 + 14, 72, "°C", COLOR_MUTED);
    s_ac_room_lbl = make_label(s_ac_ctrl, &node_font_vi_16, 0, 108, "Phòng: --", COLOR_MUTED);
    lv_obj_set_width(s_ac_room_lbl, width);
    lv_obj_set_style_text_align(s_ac_room_lbl, LV_TEXT_ALIGN_CENTER, 0);

    make_label(s_ac_ctrl, &node_font_vi_16, PAD, 146, "16", COLOR_MUTED);
    make_label(s_ac_ctrl, &node_font_vi_16, width - PAD - 20, 146, "30", COLOR_MUTED);
    s_ac_slider = lv_slider_create(s_ac_ctrl);
    lv_obj_set_pos(s_ac_slider, PAD + 40, 150);
    lv_obj_set_size(s_ac_slider, width - 2 * (PAD + 40), 12);
    lv_slider_set_range(s_ac_slider, NODE_UI_AC_TEMP_MIN, NODE_UI_AC_TEMP_MAX);
    lv_obj_set_style_bg_color(s_ac_slider, COLOR_TILE, LV_PART_MAIN);
    lv_obj_set_style_bg_opa(s_ac_slider, LV_OPA_COVER, LV_PART_MAIN);
    lv_obj_set_style_bg_color(s_ac_slider, COLOR_ACCENT, LV_PART_INDICATOR);
    lv_obj_set_style_bg_color(s_ac_slider, COLOR_TEXT, LV_PART_KNOB);
    lv_obj_set_style_pad_all(s_ac_slider, 8, LV_PART_KNOB);   /* núm to cho ngón tay */
    lv_obj_set_ext_click_area(s_ac_slider, 14);
    lv_obj_add_event_cb(s_ac_slider, ac_slider_cb, LV_EVENT_VALUE_CHANGED, NULL);
    ac_show_temp();

    /* Học mã: lưới 4×4 — TẮT, 16..30°C; ô đang chờ remote có viền vàng nháy */
    s_ac_learn = make_view(s_ac_panel, width, view_h);
    lv_obj_add_flag(s_ac_learn, LV_OBJ_FLAG_HIDDEN);
    lv_coord_t sw = (width - 2 * PAD - (AC_SLOT_COLS - 1) * TILE_GAP) / AC_SLOT_COLS;
    for (int i = 0; i < AC_SLOT_COUNT; i++) {
        lv_coord_t x = PAD + (lv_coord_t)(i % AC_SLOT_COLS) * (sw + TILE_GAP);
        lv_coord_t y = (lv_coord_t)(i / AC_SLOT_COLS) * (AC_SLOT_H + 6);
        s_ac_slot_btn[i] = make_button(s_ac_learn, x, y, sw, AC_SLOT_H, "", &node_font_vi_16, COLOR_TILE,
                                       &s_ac_slot_lbl[i]);
        lv_obj_set_style_border_color(s_ac_slot_btn[i], COLOR_WARN, 0);
        lv_obj_add_event_cb(s_ac_slot_btn[i], ac_slot_cb, LV_EVENT_SHORT_CLICKED, (void *)(intptr_t)i);
        lv_obj_add_event_cb(s_ac_slot_btn[i], ac_slot_cb, LV_EVENT_LONG_PRESSED, (void *)(intptr_t)i);
    }
    ac_render_slots();

    s_ac_msg = make_label(s_ac_panel, &node_font_vi_16, PAD, PANEL_MSG_Y, "", COLOR_MUTED);
    lv_obj_set_width(s_ac_msg, width - 2 * PAD);
    lv_label_set_long_mode(s_ac_msg, LV_LABEL_LONG_WRAP);   /* tối đa 3 dòng; lúc đếm ngược thông báo chỉ 2 dòng */

    /* Đếm ngược lúc chờ remote (dòng cuối): "Còn 7 giây" + thanh */
    s_ac_count_lbl = make_label(s_ac_panel, &node_font_vi_16, PAD, height - 24, "", COLOR_WARN);
    s_ac_count_bar = lv_bar_create(s_ac_panel);
    lv_obj_set_pos(s_ac_count_bar, PAD + 120, height - 18);
    lv_obj_set_size(s_ac_count_bar, width - 2 * PAD - 120, 8);
    lv_bar_set_range(s_ac_count_bar, 0, 100);
    lv_obj_set_style_bg_color(s_ac_count_bar, COLOR_TILE, LV_PART_MAIN);
    lv_obj_set_style_bg_opa(s_ac_count_bar, LV_OPA_COVER, LV_PART_MAIN);
    lv_obj_set_style_bg_color(s_ac_count_bar, COLOR_WARN, LV_PART_INDICATOR);
    lv_obj_add_flag(s_ac_count_lbl, LV_OBJ_FLAG_HIDDEN);
    lv_obj_add_flag(s_ac_count_bar, LV_OBJ_FLAG_HIDDEN);

    s_ac_temp_timer = lv_timer_create(ac_temp_timer_cb, AC_TEMP_DEBOUNCE_MS, NULL);
    lv_timer_pause(s_ac_temp_timer);
    s_ac_learn_timer = lv_timer_create(ac_learn_timer_cb, AC_LEARN_TICK_MS, NULL);
    lv_timer_pause(s_ac_learn_timer);
}

/* ---- bảng Rèm cửa ------------------------------------------------------------------------------------- */

static void cur_emit(node_ui_curtain_op_t op, int value)
{
    if (s_cur_cbs.on_op != NULL) {
        s_cur_cbs.on_op(op, value, s_cur_cbs.ctx);
    }
}

static void cur_default_msg(void)
{
    if (s_cur_calibrated) {
        set_msg(s_cur_msg, NODE_UI_MSG_INFO, "Rèm lệch mức: nhích tới mép rồi bấm Đặt là ĐÓNG hẳn / Đặt là MỞ hẳn.");
    } else {
        set_msg(s_cur_msg, NODE_UI_MSG_WARN,
                "Chưa hiệu chuẩn: giữ Nhích ĐÓNG tới mép, bấm Đặt là ĐÓNG hẳn; rồi Nhích MỞ, bấm Đặt là MỞ hẳn.");
    }
}

static void cur_button_cb(lv_event_t *e)
{
    switch ((int)(intptr_t)lv_event_get_user_data(e)) {
    case CUR_BTN_BACK:
        lv_obj_add_flag(s_cur_panel, LV_OBJ_FLAG_HIDDEN);
        break;
    case CUR_BTN_STOP:
        cur_emit(NODE_UI_CURTAIN_STOP, 0);
        break;
    case CUR_BTN_MARK_CLOSED:
        cur_emit(NODE_UI_CURTAIN_MARK_CLOSED, 0);
        break;
    case CUR_BTN_MARK_OPEN:
        cur_emit(NODE_UI_CURTAIN_MARK_OPEN, 0);
        break;
    default:
        break;
    }
}

/* Nút nhích: chạm → nhích; giữ lâu → lặp lại (~100 ms/lần, application nối tiếp đích); thả / trượt tay ra → dừng. */
static void cur_jog_cb(lv_event_t *e)
{
    const bool open = (intptr_t)lv_event_get_user_data(e) != 0;
    switch (lv_event_get_code(e)) {
    case LV_EVENT_PRESSED:
    case LV_EVENT_LONG_PRESSED_REPEAT:
        cur_emit(open ? NODE_UI_CURTAIN_JOG_OPEN : NODE_UI_CURTAIN_JOG_CLOSE, 0);
        break;
    case LV_EVENT_RELEASED:
    case LV_EVENT_PRESS_LOST:
        cur_emit(NODE_UI_CURTAIN_JOG_RELEASE, 0);
        break;
    default:
        break;
    }
}

/* Công tắc trên ô Rèm: bật = mở lại mức vừa dùng, tắt = đóng hẳn. */
static void cur_switch_cb(lv_event_t *e)
{
    bool on = lv_obj_has_state(lv_event_get_target(e), LV_STATE_CHECKED);
    cur_emit(on ? NODE_UI_CURTAIN_OPEN : NODE_UI_CURTAIN_CLOSE, 0);
}

static void cur_chip_cb(lv_event_t *e)
{
    cur_emit(NODE_UI_CURTAIN_SET_PERCENT, (int)(intptr_t)lv_event_get_user_data(e));
}

static void curtain_tile_cb(lv_event_t *e)
{
    (void)e;
    if (s_cur_cbs.on_op == NULL) {
        return;   /* rèm tắt trong menuconfig: không có gì để điều khiển */
    }
    cur_default_msg();
    render_curtain();
    lv_obj_clear_flag(s_cur_panel, LV_OBJ_FLAG_HIDDEN);
}

static void build_curtain_panel(lv_obj_t *scr, lv_coord_t width, lv_coord_t height)
{
    s_cur_panel = make_panel(scr, width, height);
    make_label(s_cur_panel, &node_font_vi_24, PAD, 12, "Rèm cửa", COLOR_TEXT);
    lv_obj_t *b = make_button(s_cur_panel, width - PAD - 110, 6, 110, 40, "Quay lại", &node_font_vi_16, COLOR_CHIP, NULL);
    lv_obj_add_event_cb(b, cur_button_cb, LV_EVENT_CLICKED, (void *)(intptr_t)CUR_BTN_BACK);

    /* 45%  Đang mở...                [DỪNG] */
    s_cur_pct = make_label(s_cur_panel, FONT_BIG, PAD, PANEL_TITLE_H + 2, "--%", COLOR_TEXT);
    s_cur_status = make_label(s_cur_panel, &node_font_vi_24, PAD + 130, PANEL_TITLE_H + 14, "", COLOR_MUTED);
    b = make_button(s_cur_panel, width - PAD - 120, PANEL_TITLE_H + 2, 120, 50, "DỪNG", &node_font_vi_24, COLOR_BAD, NULL);
    lv_obj_add_event_cb(b, cur_button_cb, LV_EVENT_CLICKED, (void *)(intptr_t)CUR_BTN_STOP);

    /* Hiệu chuẩn: [Nhích ĐÓNG] [Nhích MỞ] (giữ) / [Đặt là ĐÓNG hẳn] [Đặt là MỞ hẳn] / vị trí theo bước */
    lv_coord_t hw = (width - 2 * PAD - 12) / 2;
    b = make_button(s_cur_panel, PAD, 114, hw, 48, "Nhích ĐÓNG", &node_font_vi_24, COLOR_CHIP, NULL);
    lv_obj_add_event_cb(b, cur_jog_cb, LV_EVENT_ALL, (void *)(intptr_t)0);
    b = make_button(s_cur_panel, PAD + hw + 12, 114, hw, 48, "Nhích MỞ", &node_font_vi_24, COLOR_CHIP, NULL);
    lv_obj_add_event_cb(b, cur_jog_cb, LV_EVENT_ALL, (void *)(intptr_t)1);
    b = make_button(s_cur_panel, PAD, 170, hw, 40, "Đặt là ĐÓNG hẳn", &node_font_vi_16, COLOR_ACCENT, NULL);
    lv_obj_add_event_cb(b, cur_button_cb, LV_EVENT_CLICKED, (void *)(intptr_t)CUR_BTN_MARK_CLOSED);
    b = make_button(s_cur_panel, PAD + hw + 12, 170, hw, 40, "Đặt là MỞ hẳn", &node_font_vi_16, COLOR_ACCENT, NULL);
    lv_obj_add_event_cb(b, cur_button_cb, LV_EVENT_CLICKED, (void *)(intptr_t)CUR_BTN_MARK_OPEN);
    s_cur_info = make_label(s_cur_panel, &node_font_vi_16, PAD, 218, "", COLOR_MUTED);

    s_cur_msg = make_label(s_cur_panel, &node_font_vi_16, PAD, PANEL_MSG_Y + 4, "", COLOR_MUTED);
    lv_obj_set_width(s_cur_msg, width - 2 * PAD);
    lv_label_set_long_mode(s_cur_msg, LV_LABEL_LONG_WRAP);   /* tối đa 3 dòng tới đáy màn hình */
}

/* ---- màn hình chính ----------------------------------------------------------------------------------- */

static void build_climate(lv_obj_t *scr, lv_coord_t width)
{
    static const char *const names[CLIMATE_COUNT] = {"Nhiệt độ", "Độ ẩm"};
    static const char *const units[CLIMATE_COUNT] = {"°C", "%"};
    lv_coord_t tile_w = (width - 2 * PAD - TILE_GAP) / 2;
    for (int i = 0; i < CLIMATE_COUNT; i++) {
        lv_obj_t *tile = make_tile(scr, PAD + (lv_coord_t)i * (tile_w + TILE_GAP), CLIMATE_Y, tile_w, CLIMATE_H);
        make_label(tile, &node_font_vi_16, TILE_PAD, 6, names[i], COLOR_MUTED);
        s_climate_val[i] = make_label(tile, FONT_BIG, TILE_PAD, 26, "--", COLOR_MUTED);
        lv_obj_t *unit = make_label(tile, &node_font_vi_24, 0, 0, units[i], COLOR_MUTED);
        lv_obj_align(unit, LV_ALIGN_BOTTOM_RIGHT, -TILE_PAD, -10);   /* cố định: số đổi độ dài không phải canh lại */
    }
}

/* Gạt công tắc Đèn / Quạt: báo trạng thái muốn đặt. */
static void switch_cb(lv_event_t *e)
{
    bool on = lv_obj_has_state(lv_event_get_target(e), LV_STATE_CHECKED);
    if (s_sw_cbs.on_set != NULL) {
        s_sw_cbs.on_set((node_ui_dev_t)(intptr_t)lv_event_get_user_data(e), on, s_sw_cbs.ctx);
    }
}

/* Chạm ô Đèn / Quạt (ngoài công tắc): đảo trạng thái — đích chạm to cho màn cảm ứng điện trở. */
static void switch_tile_cb(lv_event_t *e)
{
    node_ui_dev_t dev = (node_ui_dev_t)(intptr_t)lv_event_get_user_data(e);
    if (s_sw_cbs.on_set != NULL) {
        s_sw_cbs.on_set(dev, !(s_dev_val[dev] > 0), s_sw_cbs.ctx);
    }
}

static void build_devices(lv_obj_t *scr, lv_coord_t width)
{
    static const char *const names[NODE_UI_DEV_COUNT] = {"Đèn", "Quạt", "Rèm cửa", "Điều hòa"};
    lv_coord_t tile_w = (width - 2 * PAD - TILE_GAP) / 2;   /* 220 */
    for (int i = 0; i < NODE_UI_DEV_COUNT; i++) {
        lv_coord_t x = PAD + (lv_coord_t)(i % 2) * (tile_w + TILE_GAP);
        lv_coord_t y = GRID_Y + (lv_coord_t)(i / 2) * (TILE_H + TILE_GAP);
        s_dev_tile[i] = make_tile(scr, x, y, tile_w, TILE_H);
        lv_obj_add_flag(s_dev_tile[i], LV_OBJ_FLAG_CLICKABLE);
        lv_obj_set_style_bg_color(s_dev_tile[i], COLOR_TILE_PRESSED, LV_STATE_PRESSED);
        make_label(s_dev_tile[i], &node_font_vi_16, TILE_PAD, 10, names[i], COLOR_TEXT);
        s_dev_switch[i] = make_switch(s_dev_tile[i], tile_w - TILE_PAD - SW_W, 8, SW_W, SW_H);
        if (i == NODE_UI_DEV_CURTAIN) {
            /* Rèm: "Đang chạy" nằm cạnh tên (dòng 2 dành cho 2 nút mức). */
            s_dev_sub[i] = make_label(s_dev_tile[i], &node_font_vi_16, 78, 10, "", COLOR_MUTED);
            lv_obj_set_width(s_dev_sub[i], tile_w - TILE_PAD - SW_W - 2 - 78);
        } else {
            s_dev_sub[i] = make_label(s_dev_tile[i], &node_font_vi_16, TILE_PAD, 42, "", COLOR_MUTED);
            lv_obj_set_width(s_dev_sub[i], tile_w - 2 * TILE_PAD);
        }
        lv_label_set_long_mode(s_dev_sub[i], LV_LABEL_LONG_DOT);
    }

    lv_obj_t *cur = s_dev_tile[NODE_UI_DEV_CURTAIN];
    for (size_t i = 0; i < CURTAIN_LEVEL_COUNT; i++) {
        char text[8];
        snprintf(text, sizeof(text), "%d%%", CURTAIN_LEVELS[i]);
        s_cur_chip[i] = make_button(cur, TILE_PAD + (lv_coord_t)i * (CHIP_W + CHIP_GAP), CHIP_Y, CHIP_W, CHIP_H, text,
                                    &node_font_vi_16, COLOR_CHIP, NULL);
        lv_obj_set_style_radius(s_cur_chip[i], 8, 0);
        lv_obj_add_event_cb(s_cur_chip[i], cur_chip_cb, LV_EVENT_CLICKED, (void *)(intptr_t)CURTAIN_LEVELS[i]);
    }

    lv_obj_add_event_cb(s_dev_switch[NODE_UI_DEV_LAMP], switch_cb, LV_EVENT_VALUE_CHANGED,
                        (void *)(intptr_t)NODE_UI_DEV_LAMP);
    lv_obj_add_event_cb(s_dev_switch[NODE_UI_DEV_FAN], switch_cb, LV_EVENT_VALUE_CHANGED,
                        (void *)(intptr_t)NODE_UI_DEV_FAN);
    lv_obj_add_event_cb(s_dev_switch[NODE_UI_DEV_CURTAIN], cur_switch_cb, LV_EVENT_VALUE_CHANGED, NULL);
    lv_obj_add_event_cb(s_dev_switch[NODE_UI_DEV_AC], ac_power_cb, LV_EVENT_VALUE_CHANGED, NULL);

    lv_obj_add_event_cb(s_dev_tile[NODE_UI_DEV_LAMP], switch_tile_cb, LV_EVENT_CLICKED,
                        (void *)(intptr_t)NODE_UI_DEV_LAMP);
    lv_obj_add_event_cb(s_dev_tile[NODE_UI_DEV_FAN], switch_tile_cb, LV_EVENT_CLICKED, (void *)(intptr_t)NODE_UI_DEV_FAN);
    lv_obj_add_event_cb(s_dev_tile[NODE_UI_DEV_CURTAIN], curtain_tile_cb, LV_EVENT_CLICKED, NULL);
    lv_obj_add_event_cb(s_dev_tile[NODE_UI_DEV_AC], ac_tile_cb, LV_EVENT_CLICKED, NULL);
}

static void build_screen(void)
{
    lv_obj_t *scr = lv_scr_act();
    lv_obj_set_style_bg_color(scr, COLOR_BG, 0);
    lv_obj_set_style_bg_opa(scr, LV_OPA_COVER, 0);
    lv_obj_clear_flag(scr, LV_OBJ_FLAG_SCROLLABLE);
    lv_coord_t width = lv_obj_get_width(scr);
    lv_coord_t height = lv_obj_get_height(scr);

    /* Tiêu đề: tên phòng, ngày giờ, chấm kết nối Gateway (chấm cố định sát mép; ngày giờ canh phải ngay trước chấm). */
    make_label(scr, &node_font_vi_24, PAD, 6, "Living Room", COLOR_TEXT);
    s_link_dot = lv_obj_create(scr);
    lv_obj_remove_style_all(s_link_dot);
    lv_obj_set_size(s_link_dot, LINK_DOT, LINK_DOT);
    lv_obj_set_style_radius(s_link_dot, LV_RADIUS_CIRCLE, 0);
    lv_obj_set_style_bg_opa(s_link_dot, LV_OPA_COVER, 0);
    lv_obj_set_style_bg_color(s_link_dot, COLOR_BAD, 0);
    lv_obj_clear_flag(s_link_dot, LV_OBJ_FLAG_CLICKABLE);
    lv_obj_align(s_link_dot, LV_ALIGN_TOP_RIGHT, -PAD, 15);
    s_date_label = lv_label_create(scr);
    lv_obj_set_style_text_font(s_date_label, &node_font_vi_16, 0);
    lv_obj_set_style_text_color(s_date_label, COLOR_MUTED, 0);
    lv_label_set_text(s_date_label, "--/--/----  --:--");
    lv_obj_align(s_date_label, LV_ALIGN_TOP_RIGHT, -(PAD + LINK_DOT + 10), 11);

    build_climate(scr, width);
    build_devices(scr, width);

    /* Dòng dưới cùng: biểu tượng sóng (kết nối Gateway — Node không vào WiFi nhà nên không có IP) + thông báo. */
    s_link_icon = make_label(scr, &node_font_vi_16, PAD, FOOT_Y, LV_SYMBOL_WIFI, COLOR_BAD);
    s_notice_label = make_label(scr, &node_font_vi_16, PAD + 30, FOOT_Y, "", COLOR_MUTED);
    lv_obj_set_width(s_notice_label, width - 2 * PAD - 30);
    lv_label_set_long_mode(s_notice_label, LV_LABEL_LONG_DOT);
    render_footer();

    build_ac_panel(scr, width, height);
    build_curtain_panel(scr, width, height);
    render_all_devices();

#if CONFIG_NODE_UI_TOUCH_TEST
    lv_obj_add_event_cb(scr, screen_event_cb, LV_EVENT_ALL, NULL);
    /* Tạo sau cùng để nằm trên mọi đối tượng; không nhận chạm. */
    s_dot = lv_obj_create(scr);
    lv_obj_remove_style_all(s_dot);
    lv_obj_set_size(s_dot, 16, 16);
    lv_obj_set_style_radius(s_dot, LV_RADIUS_CIRCLE, 0);
    lv_obj_set_style_bg_color(s_dot, COLOR_OK, 0);
    lv_obj_set_style_bg_opa(s_dot, LV_OPA_COVER, 0);
    lv_obj_clear_flag(s_dot, LV_OBJ_FLAG_CLICKABLE);
    lv_obj_add_flag(s_dot, LV_OBJ_FLAG_HIDDEN);
#endif

    lv_timer_create(tick_cb, 1000, NULL);
}

/* ---- API ---------------------------------------------------------------------------------------------- */

esp_err_t node_ui_start(void)
{
    ESP_RETURN_ON_FALSE(drv_display_lock(-1), ESP_ERR_INVALID_STATE, TAG, "display not initialised");
    build_screen();
    drv_display_unlock();
    return ESP_OK;
}

void node_ui_set_climate(bool ok, float temperature_c, float humidity_pct)
{
    if (s_notice_label == NULL || !drv_display_lock(-1)) {
        return;
    }
    char buf[40];
    if (ok) {
        snprintf(buf, sizeof(buf), "%.1f", (double)temperature_c);
        lv_label_set_text(s_climate_val[CLIMATE_TEMP], buf);
        snprintf(buf, sizeof(buf), "%.0f", (double)humidity_pct);
        lv_label_set_text(s_climate_val[CLIMATE_HUMI], buf);
        snprintf(buf, sizeof(buf), "Phòng: %.1f°C, độ ẩm %.0f%%", (double)temperature_c, (double)humidity_pct);
    } else {
        lv_label_set_text(s_climate_val[CLIMATE_TEMP], "--");
        lv_label_set_text(s_climate_val[CLIMATE_HUMI], "--");
        strlcpy(buf, "Phòng: --", sizeof(buf));
    }
    lv_label_set_text(s_ac_room_lbl, buf);
    for (int i = 0; i < CLIMATE_COUNT; i++) {
        lv_obj_set_style_text_color(s_climate_val[i], ok ? COLOR_TEXT : COLOR_MUTED, 0);
    }
    s_sensor_state = ok ? SENSOR_OK : SENSOR_ERROR;
    render_footer();
    drv_display_unlock();
}

void node_ui_set_link(node_ui_link_t link)
{
    if (s_link_dot == NULL || !drv_display_lock(-1)) {
        return;
    }
    lv_color_t color = link == NODE_UI_LINK_ONLINE ? COLOR_OK : link == NODE_UI_LINK_SEARCHING ? COLOR_WARN : COLOR_BAD;
    lv_obj_set_style_bg_color(s_link_dot, color, 0);
    lv_obj_set_style_text_color(s_link_icon, color, 0);
    drv_display_unlock();
}

void node_ui_set_notice(node_ui_msg_t level, const char *text)
{
    if (s_notice_label == NULL || text == NULL || !drv_display_lock(-1)) {
        return;
    }
    strlcpy(s_notice_text, text, sizeof(s_notice_text));
    s_notice_level = level;
    s_notice_active = true;
    s_notice_tick = lv_tick_get();
    render_footer();
    drv_display_unlock();
}

void node_ui_set_device(node_ui_dev_t dev, int state)
{
    if ((unsigned)dev >= NODE_UI_DEV_COUNT || dev == NODE_UI_DEV_CURTAIN || s_dev_tile[dev] == NULL ||
        !drv_display_lock(-1)) {
        return;
    }
    s_dev_val[dev] = state < 0 ? NODE_UI_STATE_UNKNOWN : state;
    render_device(dev);
    drv_display_unlock();
}

void node_ui_set_switch_callbacks(const node_ui_switch_callbacks_t *cbs)
{
    if (cbs == NULL || !drv_display_lock(-1)) {
        return;
    }
    s_sw_cbs = *cbs;
    render_all_devices();
    drv_display_unlock();
}

void node_ui_set_curtain_callbacks(const node_ui_curtain_callbacks_t *cbs)
{
    if (cbs == NULL || !drv_display_lock(-1)) {
        return;
    }
    s_cur_cbs = *cbs;
    render_all_devices();
    drv_display_unlock();
}

void node_ui_set_curtain(int percent, int target_percent, bool moving, int32_t position, int32_t travel, bool calibrated)
{
    if (s_cur_panel == NULL || !drv_display_lock(-1)) {
        return;
    }
    s_cur_percent = percent < 0 ? -1 : (percent > 100 ? 100 : percent);
    s_cur_target = target_percent < 0 ? 0 : (target_percent > 100 ? 100 : target_percent);
    s_cur_moving = moving;
    s_cur_position = position;
    s_cur_travel = travel;
    s_cur_calibrated = calibrated;
    render_curtain();
    drv_display_unlock();
}

void node_ui_set_curtain_message(node_ui_msg_t level, const char *text)
{
    if (s_cur_msg == NULL || text == NULL || !drv_display_lock(-1)) {
        return;
    }
    set_msg(s_cur_msg, level, text);
    drv_display_unlock();
}

void node_ui_set_ac_setpoint(float setpoint_c)
{
    if (s_ac_panel == NULL || !drv_display_lock(-1)) {
        return;
    }
    s_ac_setpoint = setpoint_c;
    /* Đang chờ gửi nhiệt độ người dùng vừa chỉnh thì giữ số trên bảng; còn lại hiện số đã xác nhận. */
    if (!isnan(setpoint_c) && !s_ac_temp_pending) {
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
    render_all_devices();
    drv_display_unlock();
}

void node_ui_set_ac_learned(uint32_t mask)
{
    if (s_ac_panel == NULL || !drv_display_lock(-1)) {
        return;
    }
    s_ac_learned = mask;
    ac_render_slots();
    ac_show_temp();   /* mức đang hiện có thể vừa được học: số đổi từ vàng sang trắng */
    drv_display_unlock();
}

void node_ui_set_ac_learning(int slot, uint32_t timeout_ms)
{
    if (s_ac_panel == NULL || !drv_display_lock(-1)) {
        return;
    }
    ac_learning_stop();
    bool valid = slot == NODE_UI_AC_SLOT_OFF || (slot >= NODE_UI_AC_TEMP_MIN && slot <= NODE_UI_AC_TEMP_MAX);
    if (timeout_ms > 0 && valid) {
        s_ac_learning_idx = ac_slot_index(slot);
        s_ac_learn_start = lv_tick_get();
        s_ac_learn_ms = timeout_ms;
        lv_obj_clear_flag(s_ac_count_lbl, LV_OBJ_FLAG_HIDDEN);
        lv_obj_clear_flag(s_ac_count_bar, LV_OBJ_FLAG_HIDDEN);
        ac_learn_timer_cb(NULL);
        lv_timer_resume(s_ac_learn_timer);
    }
    drv_display_unlock();
}

void node_ui_set_ac_message(node_ui_msg_t level, const char *text)
{
    if (s_ac_msg == NULL || text == NULL || !drv_display_lock(-1)) {
        return;
    }
    set_msg(s_ac_msg, level, text);
    drv_display_unlock();
}
