#include "gw_ui.h"

#include <inttypes.h>
#include <math.h>
#include <stdatomic.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <time.h>

#include "cJSON.h"
#include "esp_heap_caps.h"
#include "esp_log.h"
#include "esp_timer.h"
#include "freertos/FreeRTOS.h"
#include "freertos/semphr.h"
#include "gw_display.h"
#include "gw_live_view.h"
#include "lvgl.h"

static const char *TAG = "gw_ui";

#define REFRESH_MS 200
#define STATUS_MAX 160   /* UTF-8: chữ có dấu chiếm 2–3 byte */

/* Bố cục 800x480: header 0–44 (tên + ngày giờ), chân trang ở y 452 (trạng thái + WiFi + máy chủ); giữa là nav + nội dung. */
#define SCREEN_W 800
#define BODY_Y 48
#define BODY_H 396
#define NAV_X 8
#define NAV_W 150
#define NAV_GAP 9
#define NAV_BTN_H ((BODY_H - (GW_UI_PAGE_COUNT - 1) * NAV_GAP) / GW_UI_PAGE_COUNT)
#define CONTENT_X (NAV_X + NAV_W + 8)
#define CONTENT_W (SCREEN_W - CONTENT_X - 8)
#define PAD 12
#define INNER_W (CONTENT_W - 2 * PAD)   /* 602 */
#define INNER_H (BODY_H - 2 * PAD)      /* 372 */
#define TITLE_H 34                      /* hàng tiêu đề: tên trang (trái) · trạng thái kết nối (phải) */

/* Trang Camera: khung hình chiếm hết phần dưới hàng tiêu đề, ảnh 4:3 căn giữa */
#define LIVE_BOX_H (INNER_H - TITLE_H)  /* 338 */
#define LIVE_W 448                      /* VGA x0,7 — cao vừa LIVE_BOX_H, giữ tỉ lệ 4:3 */
#define LIVE_H 336

/*
 * Trang LIVING ROOM: 2 ô số đo + 4 ô thiết bị (mỗi ô có công tắc ở góc trên phải; ô rèm rộng hơn để chứa 2 nút mức
 * 50 % / 100 %) + 1 dòng thông tin node.
 */
#define GAP 12
#define CLIMATE_W ((INNER_W - GAP) / 2)          /* 295 */
#define CLIMATE_H 140
#define ACT_COUNT 4
#define ACT_W 130                                /* quạt, điều hòa, đèn */
#define CURTAIN_W (INNER_W - (ACT_COUNT - 1) * (ACT_W + GAP))   /* 176 */
#define ACT_H 136
#define ACT_Y (TITLE_H + CLIMATE_H + GAP)        /* 186 */
#define INFO_Y (ACT_Y + ACT_H + 16)              /* 338 */
#define SW_W 40
#define SW_H 22
#define SW_MARGIN 6
#define LEVEL_COUNT 2
#define LEVEL_H 56
#define LEVEL_GAP 8
#define SW_CLICK_EXT 16    /* vùng chạm công tắc nới thêm quanh công tắc (không chồng lên nút mức rèm bên dưới) */
#define LEVEL_CLICK_EXT 3  /* nới vùng chạm nút mức rèm, nhỏ hơn LEVEL_GAP / 2 để 2 nút không chồng nhau */

/* Chân trang: dòng trạng thái (trái) + WiFi · Máy chủ (phải) */
#define FOOTER_Y 452
#define STATUS_W 430

#define STATE_UNKNOWN (-1)

/* Sau khi người dùng gạt công tắc, giữ vị trí vừa gạt chờ Node ack/telemetry (xoá khi có ack, telemetry hoặc lệnh lỗi) */
#define HOLD_US (3 * 1000 * 1000LL)

/*
 * Font tiếng Việt có dấu (bất biến 10): Montserrat Medium + biểu tượng LV_SYMBOL_* — sinh bằng fonts/gen_fonts.sh.
 * Riêng số đo cỡ lớn chỉ cần chữ số → dùng Montserrat 40 có sẵn của LVGL.
 */
LV_FONT_DECLARE(gw_font_vi_16);
LV_FONT_DECLARE(gw_font_vi_20);
LV_FONT_DECLARE(gw_font_vi_24);
#define FONT_TEXT (&gw_font_vi_16)
#define FONT_TITLE (&gw_font_vi_20)
#define FONT_VALUE (&gw_font_vi_24)
#if LV_FONT_MONTSERRAT_40
#define FONT_BIG (&lv_font_montserrat_40)
#else
#define FONT_BIG FONT_VALUE
#endif

#define COLOR_BG lv_color_hex(0x10151b)
#define COLOR_CARD lv_color_hex(0x1c242d)
#define COLOR_TILE lv_color_hex(0x252f3b)
#define COLOR_TILE_ON lv_color_hex(0x173a2a)   /* ô thiết bị đang bật */
#define COLOR_ACCENT lv_color_hex(0x2563eb)
#define COLOR_ON_ACCENT lv_color_hex(0xdbe7ff)
#define COLOR_TEXT lv_color_hex(0xe8edf2)
#define COLOR_MUTED lv_color_hex(0x8a96a3)
#define COLOR_OK lv_color_hex(0x3ecf8e)
#define COLOR_WARN lv_color_hex(0xf5b942)
#define COLOR_BAD lv_color_hex(0xf06a5b)

/* ---- mô hình (dưới s_lock) ---------------------------------------------------------------------------- */

typedef enum {
    ACT_FAN = 0,
    ACT_AC,
    ACT_LAMP,
    ACT_CURTAIN,
} act_t;

typedef struct {
    char status[STATUS_MAX];
    bool status_error;
    bool wifi;
    char ip[16];
    bool server;
    bool time_synced;

    /* Node phòng khách — chỉ trường có trong telemetry mới được cập nhật */
    char room_dev[GW_UI_ID_MAX + 1];
    float temperature, humidity, light, ac_temp;   /* NAN = chưa có */
    int16_t act[ACT_COUNT];                         /* STATE_UNKNOWN, 0, 1; rèm có thể 2..100 (%) */
    int64_t room_ts;                                /* sn_timestamp của gói gần nhất */
    int64_t hold_until_us[ACT_COUNT];               /* esp_timer: công tắc vừa gạt, chưa theo mô hình tới mốc này */

    gw_ui_device_t devices[GW_UI_MAX_DEVICES];
    size_t device_count;

    gw_ui_page_t page;
    gw_ui_live_state_t live_state;
    bool live_has_frame;       /* đã có khung của lần mở này (không hiện khung cũ của lần trước) */
    uint16_t live_fps_x10;
    bool remote_view;          /* đang có phiên xem từ xa (relay lên Server) */
} model_t;

static SemaphoreHandle_t s_lock;
static model_t s_model;
static bool s_dirty;
static bool s_started;
static atomic_bool s_live_on;   /* live_state != OFF — đọc không khoá từ task đẩy khung (gw_live_view_submit) */

/* ---- widget (chỉ task LVGL truy cập sau khi tạo, hoặc task khác khi giữ khoá LVGL) ---------------------- */

/* Báo hiệu kết nối ở góc phải hàng tiêu đề: chấm màu + chữ. */
typedef struct {
    lv_obj_t *dot;
    lv_obj_t *label;
} link_ind_t;

static lv_obj_t *s_ico_wifi, *s_lbl_wifi, *s_lbl_server, *s_lbl_clock, *s_lbl_status;

/*
 * Footer bên phải, từ phải sang trái: "Máy chủ" sát mép · IP (hoặc "Mất kết nối") · biểu tượng WiFi 24 px.
 * lv_obj_align_to chỉ tính 1 lần theo kích thước lúc gọi → gọi lại mỗi khi chữ đổi (render_header_footer).
 */
static void footer_layout(void)
{
    lv_obj_align(s_lbl_server, LV_ALIGN_TOP_RIGHT, -16, FOOTER_Y);
    lv_obj_update_layout(s_lbl_server);   /* cập nhật kích thước chữ mới trước khi canh theo nó */
    lv_obj_align_to(s_lbl_wifi, s_lbl_server, LV_ALIGN_OUT_LEFT_MID, -24, 0);
    lv_obj_update_layout(s_lbl_wifi);
    lv_obj_align_to(s_ico_wifi, s_lbl_wifi, LV_ALIGN_OUT_LEFT_MID, -6, 0);
}
static lv_obj_t *s_nav_btn[GW_UI_PAGE_COUNT], *s_nav_icon[GW_UI_PAGE_COUNT], *s_nav_title[GW_UI_PAGE_COUNT],
    *s_nav_sub[GW_UI_PAGE_COUNT];
static lv_obj_t *s_page_obj[GW_UI_PAGE_COUNT];
static gw_ui_page_t s_shown_page = GW_UI_PAGE_CAMERA;
/* trang Camera */
static link_ind_t s_cam_link;
static lv_obj_t *s_live_img, *s_live_wait, *s_remote_badge;
/* trang LIVING ROOM */
static link_ind_t s_room_link;
static lv_obj_t *s_climate_val[2];
static lv_obj_t *s_act_tile[ACT_COUNT], *s_act_switch[ACT_COUNT], *s_act_sub[ACT_COUNT];
static lv_obj_t *s_level_btn[LEVEL_COUNT];   /* nút mức rèm 50 / 100 % */
static lv_obj_t *s_room_info;
/* trang Thiết bị */
static lv_obj_t *s_table;

static gw_ui_page_cb_t s_page_cb;
static void *s_page_ctx;
static gw_ui_control_cb_t s_ctl_cb;
static void *s_ctl_ctx;

static const char *const ACT_TARGET[ACT_COUNT] = {"fan", "ac", "lamp", "curtain"};
static const int CURTAIN_LEVEL[LEVEL_COUNT] = {50, 100};

static void model_update_begin(void)
{
    xSemaphoreTake(s_lock, portMAX_DELAY);
}

static void model_update_end(void)
{
    s_dirty = true;
    xSemaphoreGive(s_lock);
}

static void fmt_hms(int64_t ts, char *buf, size_t cap)
{
    if (ts <= 0) {
        strlcpy(buf, "--:--:--", cap);
        return;
    }
    time_t t = (time_t)ts;
    struct tm tm;
    localtime_r(&t, &tm);   /* múi giờ đặt ở application (TZ) */
    strftime(buf, cap, "%H:%M:%S", &tm);
}

/* "Th 7 14/11/2026  21:05:33" (CN, Th 2 … Th 7); ts <= 0 (chưa có giờ) → "--/--/----  --:--:--". */
static void fmt_datetime(int64_t ts, char *buf, size_t cap)
{
    static const char *const wday[7] = {"CN", "Th 2", "Th 3", "Th 4", "Th 5", "Th 6", "Th 7"};
    if (ts <= 0) {
        strlcpy(buf, "--/--/----  --:--:--", cap);
        return;
    }
    time_t t = (time_t)ts;
    struct tm tm;
    localtime_r(&t, &tm);   /* múi giờ đặt ở application (TZ) */
    snprintf(buf, cap, "%s %02d/%02d/%04d  %02d:%02d:%02d", wday[(unsigned)tm.tm_wday % 7u], tm.tm_mday, tm.tm_mon + 1,
             tm.tm_year + 1900, tm.tm_hour, tm.tm_min, tm.tm_sec);
}

/* ---- khung hình camera: đường ống giải nén ở gw_live_view.c; 3 hàm dưới là cầu nối sang LVGL + mô hình ---------- */

static bool live_is_on(void)
{
    return atomic_load(&s_live_on);
}

/* Đang giữ khoá LVGL (gw_live_view đổi ảnh). */
static void live_present(const lv_img_dsc_t *dsc)
{
    lv_img_set_src(s_live_img, dsc);
    lv_obj_clear_flag(s_live_img, LV_OBJ_FLAG_HIDDEN);
    lv_obj_add_flag(s_live_wait, LV_OBJ_FLAG_HIDDEN);
}

static void live_shown(uint16_t fps_x10, bool fps_updated)
{
    xSemaphoreTake(s_lock, portMAX_DELAY);
    bool changed = !s_model.live_has_frame || (fps_updated && s_model.live_fps_x10 != fps_x10);
    s_model.live_has_frame = true;
    if (fps_updated) {
        s_model.live_fps_x10 = fps_x10;
    }
    if (changed) {
        s_dirty = true;   /* chỉ vẽ lại chữ khi có thay đổi — không vẽ lại cả màn hình mỗi khung */
    }
    xSemaphoreGive(s_lock);
}

/* ---- khối dựng ------------------------------------------------------------------------------------------ */

/* Khối nền phẳng, không viền/đệm (toạ độ con tính từ góc trên trái). */
static lv_obj_t *make_box(lv_obj_t *parent, lv_coord_t x, lv_coord_t y, lv_coord_t w, lv_coord_t h, lv_color_t bg,
                          lv_opa_t opa)
{
    lv_obj_t *o = lv_obj_create(parent);
    lv_obj_remove_style_all(o);
    lv_obj_set_pos(o, x, y);
    lv_obj_set_size(o, w, h);
    lv_obj_set_style_bg_color(o, bg, 0);
    lv_obj_set_style_bg_opa(o, opa, 0);
    lv_obj_clear_flag(o, LV_OBJ_FLAG_SCROLLABLE | LV_OBJ_FLAG_CLICKABLE);
    return o;
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

static lv_obj_t *make_tile(lv_obj_t *parent, lv_coord_t x, lv_coord_t y, lv_coord_t w, lv_coord_t h)
{
    lv_obj_t *t = make_box(parent, x, y, w, h, COLOR_TILE, LV_OPA_COVER);
    lv_obj_set_style_radius(t, 10, 0);
    return t;
}

/* Góc phải hàng tiêu đề: chấm tròn 12 px + chữ trạng thái kết nối. */
static void make_link_ind(lv_obj_t *page, link_ind_t *ind)
{
    ind->label = lv_label_create(page);
    lv_label_set_text(ind->label, "");
    lv_obj_set_style_text_font(ind->label, FONT_TEXT, 0);
    lv_obj_set_style_text_color(ind->label, COLOR_MUTED, 0);
    lv_obj_align(ind->label, LV_ALIGN_TOP_RIGHT, 0, 4);

    ind->dot = lv_obj_create(page);
    lv_obj_remove_style_all(ind->dot);
    lv_obj_set_size(ind->dot, 12, 12);
    lv_obj_set_style_radius(ind->dot, LV_RADIUS_CIRCLE, 0);
    lv_obj_set_style_bg_opa(ind->dot, LV_OPA_COVER, 0);
    lv_obj_set_style_bg_color(ind->dot, COLOR_MUTED, 0);
    lv_obj_clear_flag(ind->dot, LV_OBJ_FLAG_CLICKABLE);
}

static void set_link_ind(const link_ind_t *ind, lv_color_t color, const char *text)
{
    lv_label_set_text(ind->label, text);
    lv_obj_set_style_text_color(ind->label, color, 0);
    lv_obj_set_style_bg_color(ind->dot, color, 0);
    lv_obj_update_layout(ind->label);   /* chiều rộng chữ mới, để đặt chấm ngay bên trái */
    lv_obj_align_to(ind->dot, ind->label, LV_ALIGN_OUT_LEFT_MID, -8, 0);
}

/* ---- thanh nav ------------------------------------------------------------------------------------------ */

/* Task LVGL: hiện trang `page`, ẩn các trang khác, tô mục đang chọn. */
static void apply_page(gw_ui_page_t page)
{
    for (int i = 0; i < GW_UI_PAGE_COUNT; i++) {
        const bool sel = i == (int)page;
        if (sel) {
            lv_obj_clear_flag(s_page_obj[i], LV_OBJ_FLAG_HIDDEN);
        } else {
            lv_obj_add_flag(s_page_obj[i], LV_OBJ_FLAG_HIDDEN);
        }
        lv_obj_set_style_bg_color(s_nav_btn[i], sel ? COLOR_ACCENT : COLOR_CARD, 0);
        lv_obj_set_style_text_color(s_nav_icon[i], sel ? COLOR_ON_ACCENT : COLOR_MUTED, 0);
        lv_obj_set_style_text_color(s_nav_title[i], sel ? lv_color_white() : COLOR_TEXT, 0);
    }
    s_shown_page = page;
}

static void on_nav(lv_event_t *e)
{
    const gw_ui_page_t page = (gw_ui_page_t)(uintptr_t)lv_event_get_user_data(e);
    xSemaphoreTake(s_lock, portMAX_DELAY);
    s_model.page = page;
    s_dirty = true;
    xSemaphoreGive(s_lock);
    apply_page(page);   /* đổi ngay, không chờ lần vẽ lại kế tiếp */
    if (s_page_cb != NULL) {
        s_page_cb(page, s_page_ctx);   /* kể cả chạm lại mục đang chọn: tầng trên coi là có người thao tác */
    }
}

static void make_nav(lv_obj_t *scr, gw_ui_page_t page, const char *icon, const char *title)
{
    lv_obj_t *b = lv_btn_create(scr);
    lv_obj_set_pos(b, NAV_X, BODY_Y + (lv_coord_t)page * (NAV_BTN_H + NAV_GAP));
    lv_obj_set_size(b, NAV_W, NAV_BTN_H);
    lv_obj_set_style_radius(b, 10, 0);
    lv_obj_set_style_bg_color(b, COLOR_CARD, 0);
    lv_obj_set_style_shadow_width(b, 0, 0);
    lv_obj_set_style_pad_all(b, 12, 0);
    lv_obj_add_event_cb(b, on_nav, LV_EVENT_CLICKED, (void *)(uintptr_t)page);
    s_nav_btn[page] = b;
    s_nav_icon[page] = make_label(b, FONT_VALUE, 0, 0, icon, COLOR_MUTED);
    s_nav_title[page] = make_label(b, FONT_TEXT, 0, 36, title, COLOR_TEXT);
    s_nav_sub[page] = make_label(b, FONT_TEXT, 0, 62, "", COLOR_MUTED);
    lv_obj_set_width(s_nav_sub[page], NAV_W - 24);
    lv_label_set_long_mode(s_nav_sub[page], LV_LABEL_LONG_WRAP);
}

/* ---- các trang ------------------------------------------------------------------------------------------ */

static void build_camera_page(lv_obj_t *page)
{
    make_label(page, FONT_TITLE, 0, 0, "CAMERA CỬA", COLOR_MUTED);
    make_link_ind(page, &s_cam_link);

    lv_obj_t *video = make_box(page, 0, TITLE_H, INNER_W, LIVE_BOX_H, lv_color_black(), LV_OPA_COVER);
    lv_obj_set_style_radius(video, 8, 0);   /* không clip_corner: mặt nạ bo góc làm chậm vẽ mỗi khung */
    s_live_wait = lv_label_create(video);
    lv_label_set_text(s_live_wait, "");
    lv_obj_set_width(s_live_wait, INNER_W - 60);
    lv_label_set_long_mode(s_live_wait, LV_LABEL_LONG_WRAP);
    lv_obj_set_style_text_font(s_live_wait, FONT_TITLE, 0);
    lv_obj_set_style_text_color(s_live_wait, COLOR_MUTED, 0);
    lv_obj_set_style_text_align(s_live_wait, LV_TEXT_ALIGN_CENTER, 0);
    lv_obj_center(s_live_wait);
    s_live_img = lv_img_create(video);
    lv_obj_center(s_live_img);
    lv_obj_add_flag(s_live_img, LV_OBJ_FLAG_HIDDEN);

    /* Huy hiệu "đang được xem từ xa" ở góc trên trái khung hình (tạo sau ảnh nên nằm trên). */
    s_remote_badge = make_box(video, 10, 10, 214, 28, lv_color_black(), LV_OPA_60);
    lv_obj_set_style_radius(s_remote_badge, 14, 0);
    lv_obj_t *dot = make_box(s_remote_badge, 12, 8, 12, 12, COLOR_BAD, LV_OPA_COVER);
    lv_obj_set_style_radius(dot, LV_RADIUS_CIRCLE, 0);
    make_label(s_remote_badge, FONT_TEXT, 32, 4, "Đang được xem từ xa", COLOR_TEXT);
    lv_obj_add_flag(s_remote_badge, LV_OBJ_FLAG_HIDDEN);
}

/* Task LVGL (đang giữ khoá LVGL): ghi mốc giữ công tắc rồi báo tầng trên. */
static void send_control(int act, const char *action)
{
    xSemaphoreTake(s_lock, portMAX_DELAY);
    s_model.hold_until_us[act] = esp_timer_get_time() + HOLD_US;
    s_dirty = true;
    xSemaphoreGive(s_lock);
    if (s_ctl_cb != NULL) {
        s_ctl_cb(ACT_TARGET[act], action, s_ctl_ctx);
    }
}

static void on_switch(lv_event_t *e)
{
    const int act = (int)(uintptr_t)lv_event_get_user_data(e);
    const bool on = lv_obj_has_state(lv_event_get_target(e), LV_STATE_CHECKED);
    send_control(act, on ? "turn_on" : "turn_off");
}

static void on_level(lv_event_t *e)
{
    const int level = (int)(uintptr_t)lv_event_get_user_data(e);
    char action[16];
    snprintf(action, sizeof(action), "set_pos_%d", level);
    lv_obj_add_state(s_act_switch[ACT_CURTAIN], LV_STATE_CHECKED);   /* rèm sẽ mở: công tắc theo ngay */
    send_control(ACT_CURTAIN, action);
}

/* Công tắc ở góc trên phải ô thiết bị: xám = tắt, xanh = bật; vùng chạm nới thêm cho ngón tay. */
static lv_obj_t *make_switch(lv_obj_t *tile, int act)
{
    lv_obj_t *sw = lv_switch_create(tile);
    lv_obj_set_size(sw, SW_W, SW_H);
    lv_obj_align(sw, LV_ALIGN_TOP_RIGHT, -SW_MARGIN, 10);
    lv_obj_set_ext_click_area(sw, SW_CLICK_EXT);
    lv_obj_set_style_bg_color(sw, lv_color_hex(0x55606c), LV_PART_MAIN);
    lv_obj_set_style_bg_color(sw, COLOR_OK, LV_PART_INDICATOR | LV_STATE_CHECKED);
    lv_obj_set_style_bg_color(sw, lv_color_white(), LV_PART_KNOB);
    lv_obj_set_style_opa(sw, LV_OPA_40, LV_STATE_DISABLED);
    lv_obj_add_state(sw, LV_STATE_DISABLED);   /* tới khi Node báo trạng thái */
    lv_obj_add_event_cb(sw, on_switch, LV_EVENT_VALUE_CHANGED, (void *)(uintptr_t)act);
    return sw;
}

static void build_room_page(lv_obj_t *page)
{
    make_label(page, FONT_TITLE, 0, 0, "LIVING ROOM", COLOR_MUTED);
    make_link_ind(page, &s_room_link);

    static const char *const climate_names[2] = {"NHIỆT ĐỘ", "ĐỘ ẨM"};
    static const char *const climate_units[2] = {"°C", "%"};
    for (int i = 0; i < 2; i++) {
        lv_obj_t *tile = make_tile(page, (lv_coord_t)i * (CLIMATE_W + GAP), TITLE_H, CLIMATE_W, CLIMATE_H);
        make_label(tile, FONT_TEXT, 16, 14, climate_names[i], COLOR_MUTED);
        s_climate_val[i] = make_label(tile, FONT_BIG, 16, 50, "--", COLOR_TEXT);
        make_label(tile, FONT_TITLE, 16, 104, climate_units[i], COLOR_MUTED);
    }

    /* Thứ tự theo act_t: quạt, điều hòa, đèn, rèm. Tên viết thường để vừa bên trái công tắc. */
    static const char *const act_names[ACT_COUNT] = {"Quạt", "Điều hòa", "Đèn", "Rèm cửa"};
    for (int i = 0; i < ACT_COUNT; i++) {
        const lv_coord_t w = i == ACT_CURTAIN ? CURTAIN_W : ACT_W;
        s_act_tile[i] = make_tile(page, (lv_coord_t)i * (ACT_W + GAP), ACT_Y, w, ACT_H);
        lv_obj_t *name = make_label(s_act_tile[i], FONT_TEXT, 12, 12, act_names[i], COLOR_TEXT);
        lv_obj_set_width(name, w - 12 - SW_MARGIN - SW_W - 4);
        lv_label_set_long_mode(name, LV_LABEL_LONG_CLIP);
        s_act_switch[i] = make_switch(s_act_tile[i], i);
        s_act_sub[i] = make_label(s_act_tile[i], FONT_TEXT, 12, 46, "", COLOR_MUTED);
        lv_obj_set_width(s_act_sub[i], w - 24);
        lv_label_set_long_mode(s_act_sub[i], LV_LABEL_LONG_WRAP);   /* tối đa 2 dòng trong ô */
    }

    /* Rèm: 2 nút mức mở (50 % / 100 %) to, dễ chạm; nút khớp mức hiện tại được tô (render_room). */
    const lv_coord_t lvl_w = (CURTAIN_W - 2 * 10 - (LEVEL_COUNT - 1) * LEVEL_GAP) / LEVEL_COUNT;
    for (int i = 0; i < LEVEL_COUNT; i++) {
        lv_obj_t *b = lv_btn_create(s_act_tile[ACT_CURTAIN]);
        lv_obj_set_size(b, lvl_w, LEVEL_H);
        lv_obj_set_pos(b, 10 + i * (lvl_w + LEVEL_GAP), ACT_H - 10 - LEVEL_H);
        lv_obj_set_ext_click_area(b, LEVEL_CLICK_EXT);
        lv_obj_set_style_radius(b, 6, 0);
        lv_obj_set_style_bg_color(b, COLOR_CARD, 0);
        lv_obj_set_style_shadow_width(b, 0, 0);
        lv_obj_set_style_pad_all(b, 0, 0);
        lv_obj_set_style_opa(b, LV_OPA_40, LV_STATE_DISABLED);
        lv_obj_add_state(b, LV_STATE_DISABLED);
        lv_obj_add_event_cb(b, on_level, LV_EVENT_CLICKED, (void *)(uintptr_t)CURTAIN_LEVEL[i]);
        char txt[8];
        snprintf(txt, sizeof(txt), "%d%%", CURTAIN_LEVEL[i]);
        lv_obj_t *l = lv_label_create(b);
        lv_label_set_text(l, txt);
        lv_obj_set_style_text_font(l, FONT_TITLE, 0);
        lv_obj_set_style_text_color(l, COLOR_TEXT, 0);
        lv_obj_center(l);
        s_level_btn[i] = b;
    }

    s_room_info = make_label(page, FONT_TEXT, 0, INFO_Y, "", COLOR_MUTED);
    lv_obj_set_width(s_room_info, INNER_W);
    lv_label_set_long_mode(s_room_info, LV_LABEL_LONG_DOT);
}

/*
 * Bảng thiết bị. Độ rộng cột đủ cho nội dung dài nhất ở font 16 cộng đệm 2 × DEV_CELL_PAD ("Camera", "-100 dBm",
 * "08/11 23:59"). Mọi ô KHÔNG xuống dòng: LVGL 8.4 có cờ TEXT_CROP nhưng lv_table.c (draw_main) tính xong
 * LV_TEXT_FLAG_EXPAND lại không gán vào label_dsc → chữ vẫn tự xuống dòng ("Camer" / "a"). Gán bù ở on_table_draw_begin.
 */
#define DEV_COLS 5
#define DEV_COL_STATUS 2
#define DEV_CELL_PAD 10
#define DEV_DOT 14       /* đường kính chấm trạng thái */
#define DEV_ID_SHOW 15   /* id dài hơn (VD UUID) → 15 ký tự đầu + "..." */
static const lv_coord_t s_dev_widths[DEV_COLS] = {176, 100, 104, 96, 126};   /* tổng = INNER_W (602) */
static int8_t s_dev_row_link[GW_UI_MAX_DEVICES + 2];   /* gw_ui_link_t theo hàng bảng; -1 = không vẽ chấm */

static lv_color_t link_color(gw_ui_link_t link)
{
    switch (link) {
    case GW_UI_LINK_OK:
        return COLOR_OK;
    case GW_UI_LINK_CONNECTING:
        return COLOR_WARN;
    default:
        return COLOR_BAD;
    }
}

static const char *link_text(gw_ui_link_t link)
{
    switch (link) {
    case GW_UI_LINK_OK:
        return "Đã kết nối";
    case GW_UI_LINK_CONNECTING:
        return "Đang kết nối";
    default:
        return "Chưa kết nối";
    }
}

/* Task LVGL, trước khi vẽ từng ô: không xuống dòng; hàng tiêu đề chữ nhạt nền sẫm. */
static void on_table_draw_begin(lv_event_t *e)
{
    lv_obj_draw_part_dsc_t *dsc = lv_event_get_draw_part_dsc(e);
    if (dsc->class_p != &lv_table_class || dsc->type != LV_TABLE_DRAW_PART_CELL) {
        return;
    }
    dsc->label_dsc->flag |= LV_TEXT_FLAG_EXPAND;
    if (dsc->id / DEV_COLS == 0) {
        dsc->label_dsc->color = COLOR_MUTED;
        dsc->rect_dsc->bg_color = COLOR_TILE;
    }
}

/* Task LVGL, sau khi vẽ ô: cột "Trạng thái" chỉ là 1 chấm màu (xanh / vàng / đỏ). */
static void on_table_draw_end(lv_event_t *e)
{
    lv_obj_draw_part_dsc_t *dsc = lv_event_get_draw_part_dsc(e);
    if (dsc->class_p != &lv_table_class || dsc->type != LV_TABLE_DRAW_PART_CELL || dsc->draw_area == NULL) {
        return;
    }
    const uint32_t row = dsc->id / DEV_COLS;
    if (row == 0 || row > GW_UI_MAX_DEVICES || dsc->id % DEV_COLS != DEV_COL_STATUS || s_dev_row_link[row] < 0) {
        return;
    }
    lv_draw_rect_dsc_t rd;
    lv_draw_rect_dsc_init(&rd);
    rd.radius = LV_RADIUS_CIRCLE;
    rd.bg_opa = LV_OPA_COVER;
    rd.bg_color = link_color((gw_ui_link_t)s_dev_row_link[row]);
    const lv_area_t *c = dsc->draw_area;
    lv_area_t dot;
    dot.x1 = c->x1 + DEV_CELL_PAD + 2;   /* thẳng hàng với chữ "Trạng thái" ở tiêu đề */
    dot.x2 = dot.x1 + DEV_DOT - 1;
    dot.y1 = (c->y1 + c->y2) / 2 - DEV_DOT / 2;
    dot.y2 = dot.y1 + DEV_DOT - 1;
    lv_draw_rect(dsc->draw_ctx, &rd, &dot);
}

/* Chú thích màu ở góc phải hàng tiêu đề: ● Đã kết nối  ● Đang kết nối  ● Chưa kết nối */
static void make_link_legend(lv_obj_t *page)
{
    lv_obj_t *row = lv_obj_create(page);
    lv_obj_remove_style_all(row);
    lv_obj_set_size(row, LV_SIZE_CONTENT, LV_SIZE_CONTENT);
    lv_obj_set_flex_flow(row, LV_FLEX_FLOW_ROW);
    lv_obj_set_flex_align(row, LV_FLEX_ALIGN_END, LV_FLEX_ALIGN_CENTER, LV_FLEX_ALIGN_CENTER);
    lv_obj_set_style_pad_column(row, 6, 0);
    lv_obj_clear_flag(row, LV_OBJ_FLAG_SCROLLABLE | LV_OBJ_FLAG_CLICKABLE);
    lv_obj_align(row, LV_ALIGN_TOP_RIGHT, 0, 4);

    static const gw_ui_link_t links[3] = {GW_UI_LINK_OK, GW_UI_LINK_CONNECTING, GW_UI_LINK_NONE};
    static const char *const names[3] = {"Đã kết nối", "Đang kết nối", "Chưa kết nối"};
    for (int i = 0; i < 3; i++) {
        lv_obj_t *dot = lv_obj_create(row);
        lv_obj_remove_style_all(dot);
        lv_obj_set_size(dot, 10, 10);
        lv_obj_set_style_radius(dot, LV_RADIUS_CIRCLE, 0);
        lv_obj_set_style_bg_opa(dot, LV_OPA_COVER, 0);
        lv_obj_set_style_bg_color(dot, link_color(links[i]), 0);
        lv_obj_t *l = lv_label_create(row);
        lv_label_set_text(l, names[i]);
        lv_obj_set_style_text_font(l, FONT_TEXT, 0);
        lv_obj_set_style_text_color(l, COLOR_MUTED, 0);
        if (i < 2) {
            lv_obj_set_style_pad_right(l, 10, 0);
        }
    }
}

/* merge = true: hàng thông báo trải hết chiều ngang (VD "Chưa ghép thiết bị nào"). */
static void table_row_ctrl(uint16_t row, bool merge)
{
    for (uint16_t c = 0; c < DEV_COLS; c++) {
        lv_table_add_cell_ctrl(s_table, row, c, LV_TABLE_CELL_CTRL_TEXT_CROP);
        if (merge && c < DEV_COLS - 1) {
            lv_table_add_cell_ctrl(s_table, row, c, LV_TABLE_CELL_CTRL_MERGE_RIGHT);
        } else {
            lv_table_clear_cell_ctrl(s_table, row, c, LV_TABLE_CELL_CTRL_MERGE_RIGHT);
        }
    }
}

/* Giờ lần cuối kết nối: hôm nay → "HH:MM:SS", ngày khác (hoặc Gateway chưa có giờ để so) → "DD/MM HH:MM". */
static void fmt_last_seen(int64_t ts, bool clock_ok, char *buf, size_t cap)
{
    if (ts <= 0) {
        strlcpy(buf, "Chưa từng", cap);
        return;
    }
    time_t t = (time_t)ts;
    struct tm tm;
    localtime_r(&t, &tm);   /* múi giờ đặt ở application (TZ) */
    if (clock_ok) {
        time_t now = time(NULL);
        struct tm today;
        localtime_r(&now, &today);
        if (today.tm_year == tm.tm_year && today.tm_yday == tm.tm_yday) {
            strftime(buf, cap, "%H:%M:%S", &tm);
            return;
        }
    }
    strftime(buf, cap, "%d/%m %H:%M", &tm);
}

static void build_devices_page(lv_obj_t *page)
{
    make_label(page, FONT_TITLE, 0, 0, "THIẾT BỊ ĐÃ GHÉP", COLOR_MUTED);
    make_link_legend(page);

    s_table = lv_table_create(page);
    lv_obj_set_pos(s_table, 0, TITLE_H);
    lv_obj_set_size(s_table, INNER_W, INNER_H - TITLE_H);
    lv_obj_set_style_bg_opa(s_table, LV_OPA_TRANSP, 0);
    lv_obj_set_style_border_width(s_table, 0, 0);
    lv_obj_set_style_pad_all(s_table, 0, 0);
    lv_obj_set_style_text_font(s_table, FONT_TEXT, LV_PART_ITEMS);
    lv_obj_set_style_text_color(s_table, COLOR_TEXT, LV_PART_ITEMS);
    lv_obj_set_style_bg_color(s_table, COLOR_CARD, LV_PART_ITEMS);
    lv_obj_set_style_border_width(s_table, 1, LV_PART_ITEMS);
    lv_obj_set_style_border_side(s_table, LV_BORDER_SIDE_BOTTOM, LV_PART_ITEMS);
    lv_obj_set_style_border_color(s_table, COLOR_TILE, LV_PART_ITEMS);
    lv_obj_set_style_pad_ver(s_table, 10, LV_PART_ITEMS);
    lv_obj_set_style_pad_hor(s_table, DEV_CELL_PAD, LV_PART_ITEMS);
    lv_obj_add_event_cb(s_table, on_table_draw_begin, LV_EVENT_DRAW_PART_BEGIN, NULL);
    lv_obj_add_event_cb(s_table, on_table_draw_end, LV_EVENT_DRAW_PART_END, NULL);
    lv_table_set_col_cnt(s_table, DEV_COLS);
    static const char *const heads[DEV_COLS] = {"Thiết bị", "Loại", "Trạng thái", "Tín hiệu", "Lần cuối"};
    for (uint16_t c = 0; c < DEV_COLS; c++) {
        lv_table_set_col_width(s_table, c, s_dev_widths[c]);
        lv_table_set_cell_value(s_table, 0, c, heads[c]);
    }
    lv_table_set_row_cnt(s_table, 1);
    table_row_ctrl(0, false);
}

static void build_screen(void)
{
    lv_obj_t *scr = lv_scr_act();
    lv_obj_clean(scr);
    lv_obj_set_style_bg_color(scr, COLOR_BG, 0);
    lv_obj_set_style_bg_opa(scr, LV_OPA_COVER, 0);
    lv_obj_clear_flag(scr, LV_OBJ_FLAG_SCROLLABLE);

    /* Header */
    make_label(scr, FONT_TITLE, 16, 12, "Gateway Smart Home", COLOR_TEXT);
    s_lbl_clock = make_label(scr, FONT_TITLE, 0, 0, "--/--/----  --:--:--", COLOR_TEXT);
    lv_obj_align(s_lbl_clock, LV_ALIGN_TOP_RIGHT, -16, 12);   /* căn phải: đổi chữ không tràn khỏi 800 px */

    /* Nav */
    make_nav(scr, GW_UI_PAGE_CAMERA, LV_SYMBOL_VIDEO, "CAMERA");
    make_nav(scr, GW_UI_PAGE_ROOM, LV_SYMBOL_HOME, "LIVING ROOM");
    make_nav(scr, GW_UI_PAGE_DEVICES, LV_SYMBOL_LIST, "THIẾT BỊ");

    /* Nội dung: 1 thẻ chung, mỗi trang là 1 khối con trong suốt, chỉ hiện trang đang chọn */
    lv_obj_t *content = lv_obj_create(scr);
    lv_obj_set_pos(content, CONTENT_X, BODY_Y);
    lv_obj_set_size(content, CONTENT_W, BODY_H);
    lv_obj_set_style_bg_color(content, COLOR_CARD, 0);
    lv_obj_set_style_border_width(content, 0, 0);
    lv_obj_set_style_radius(content, 10, 0);
    lv_obj_set_style_pad_all(content, PAD, 0);
    lv_obj_clear_flag(content, LV_OBJ_FLAG_SCROLLABLE);
    for (int i = 0; i < GW_UI_PAGE_COUNT; i++) {
        s_page_obj[i] = make_box(content, 0, 0, INNER_W, INNER_H, COLOR_CARD, LV_OPA_TRANSP);
    }
    build_camera_page(s_page_obj[GW_UI_PAGE_CAMERA]);
    build_room_page(s_page_obj[GW_UI_PAGE_ROOM]);
    build_devices_page(s_page_obj[GW_UI_PAGE_DEVICES]);

    /* Footer — dòng trạng thái (trái) · WiFi + máy chủ (phải, căn phải) */
    s_lbl_status = make_label(scr, FONT_TEXT, 16, FOOTER_Y, "Đang khởi động...", COLOR_MUTED);
    lv_obj_set_width(s_lbl_status, STATUS_W);
    lv_label_set_long_mode(s_lbl_status, LV_LABEL_LONG_DOT);

    /* Bên phải, xếp tay (không dùng flex lồng LV_SIZE_CONTENT — khối WiFi từng không hiện): "Máy chủ" sát mép phải,
     * IP / "Mất kết nối" bên trái nó, biểu tượng WiFi 24 px bên trái IP. Chữ đổi độ dài → footer_layout() xếp lại. */
    s_lbl_server = lv_label_create(scr);
    lv_label_set_text(s_lbl_server, LV_SYMBOL_UPLOAD " Máy chủ ...");
    lv_obj_set_style_text_font(s_lbl_server, FONT_TEXT, 0);
    s_lbl_wifi = lv_label_create(scr);
    lv_label_set_text(s_lbl_wifi, "...");
    lv_obj_set_style_text_font(s_lbl_wifi, FONT_TEXT, 0);
    lv_obj_set_style_text_color(s_lbl_wifi, COLOR_TEXT, 0);
    s_ico_wifi = lv_label_create(scr);
    lv_label_set_text(s_ico_wifi, LV_SYMBOL_WIFI);
    lv_obj_set_style_text_font(s_ico_wifi, FONT_VALUE, 0);
    lv_obj_set_style_text_color(s_ico_wifi, COLOR_MUTED, 0);
    lv_obj_set_style_text_color(s_lbl_server, COLOR_TEXT, 0);
    footer_layout();

    apply_page(s_model.page);
}

/* ---- vẽ lại từ mô hình (task LVGL, đã giữ khoá LVGL) -------------------------------------------------- */

static const gw_ui_device_t *find_device(const model_t *m, bool camera)
{
    for (size_t i = 0; i < m->device_count; i++) {
        if (m->devices[i].is_camera == camera) {
            return &m->devices[i];
        }
    }
    return NULL;
}

/* Node phòng khách: node đang gửi dữ liệu, không có thì node đầu tiên đã ghép. */
static const gw_ui_device_t *find_room_node(const model_t *m)
{
    if (m->room_dev[0] != '\0') {
        for (size_t i = 0; i < m->device_count; i++) {
            if (!m->devices[i].is_camera && strcmp(m->devices[i].device_id, m->room_dev) == 0) {
                return &m->devices[i];
            }
        }
    }
    return find_device(m, false);
}

/* snprintf của newlib (LVGL 8 mặc định không in số thực: LV_SPRINTF_USE_FLOAT = 0). */
static void fmt_value(char *buf, size_t cap, float v, int decimals)
{
    if (isnan(v)) {
        strlcpy(buf, "--", cap);
    } else {
        snprintf(buf, cap, "%.*f", decimals, (double)v);
    }
}

static void render_header_footer(const model_t *m)
{
    lv_label_set_text(s_lbl_wifi, !m->wifi ? "Mất kết nối" : m->ip[0] != '\0' ? m->ip : "Đã kết nối");
    lv_obj_set_style_text_color(s_lbl_wifi, m->wifi ? COLOR_OK : COLOR_BAD, 0);
    lv_obj_set_style_text_color(s_ico_wifi, m->wifi ? COLOR_OK : COLOR_BAD, 0);
    lv_label_set_text(s_lbl_server, m->server ? LV_SYMBOL_UPLOAD " Máy chủ OK" : LV_SYMBOL_UPLOAD " Máy chủ --");
    lv_obj_set_style_text_color(s_lbl_server, m->server ? COLOR_OK : COLOR_BAD, 0);
    footer_layout();   /* độ dài chữ IP / Máy chủ có thể vừa đổi */
    lv_label_set_text(s_lbl_status, m->status);
    lv_obj_set_style_text_color(s_lbl_status, m->status_error ? COLOR_BAD : COLOR_MUTED, 0);
}

/* Dòng tóm tắt dưới mỗi mục nav. */
static void render_nav(const model_t *m)
{
    char buf[40];
    lv_color_t color[GW_UI_PAGE_COUNT];

    const gw_ui_device_t *cam = find_device(m, true);
    if (m->live_state == GW_UI_LIVE_PLAYING) {
        lv_label_set_text(s_nav_sub[GW_UI_PAGE_CAMERA], "Trực tiếp");
        color[GW_UI_PAGE_CAMERA] = COLOR_OK;
    } else if (cam == NULL) {
        lv_label_set_text(s_nav_sub[GW_UI_PAGE_CAMERA], "Chưa ghép");
        color[GW_UI_PAGE_CAMERA] = COLOR_MUTED;
    } else {
        lv_label_set_text(s_nav_sub[GW_UI_PAGE_CAMERA], link_text(cam->link));
        color[GW_UI_PAGE_CAMERA] = link_color(cam->link);
    }

    if (!isnan(m->temperature)) {
        char t[16], h[16];
        fmt_value(t, sizeof(t), m->temperature, 1);
        fmt_value(h, sizeof(h), m->humidity, 0);
        snprintf(buf, sizeof(buf), "%s°C  %s%%", t, h);
        lv_label_set_text(s_nav_sub[GW_UI_PAGE_ROOM], buf);
        color[GW_UI_PAGE_ROOM] = COLOR_TEXT;
    } else {
        lv_label_set_text(s_nav_sub[GW_UI_PAGE_ROOM], "Chưa có dữ liệu");
        color[GW_UI_PAGE_ROOM] = COLOR_MUTED;
    }

    unsigned online = 0;
    for (size_t i = 0; i < m->device_count; i++) {
        online += m->devices[i].link == GW_UI_LINK_OK ? 1 : 0;
    }
    snprintf(buf, sizeof(buf), "%u/%u đã kết nối", online, (unsigned)m->device_count);
    lv_label_set_text(s_nav_sub[GW_UI_PAGE_DEVICES], buf);
    color[GW_UI_PAGE_DEVICES] = (m->device_count > 0 && online == m->device_count) ? COLOR_OK : COLOR_MUTED;

    for (int i = 0; i < GW_UI_PAGE_COUNT; i++) {
        /* Trên nền xanh của mục đang chọn, màu trạng thái khó đọc → dùng màu sáng chung. */
        lv_obj_set_style_text_color(s_nav_sub[i], i == (int)s_shown_page ? COLOR_ON_ACCENT : color[i], 0);
    }
}

/*
 * Kết nối Camera ↔ Gateway: xanh = đang nhận hình; vàng = đang kết nối / đã thấy camera qua ESP-NOW nhưng chưa có
 * luồng; đỏ = mất kết nối (luồng đứt hoặc không thấy gói ESP-NOW nào trong CONFIG_GW_NODE_OFFLINE_S).
 */
static void render_camera(const model_t *m)
{
    char buf[64];
    const gw_ui_device_t *cam = find_device(m, true);
    const char *link;
    lv_color_t color;
    if (cam == NULL) {
        link = "Chưa ghép camera";
        color = COLOR_MUTED;
    } else {
        switch (m->live_state) {
        case GW_UI_LIVE_PLAYING:
            if (m->live_fps_x10 > 0) {
                snprintf(buf, sizeof(buf), "Đã kết nối  %u.%u khung/s", m->live_fps_x10 / 10u, m->live_fps_x10 % 10u);
                link = buf;
            } else {
                link = "Đã kết nối";
            }
            color = COLOR_OK;
            break;
        case GW_UI_LIVE_CONNECTING:
            link = "Đang kết nối...";
            color = COLOR_WARN;
            break;
        case GW_UI_LIVE_RETRY:
            link = "Mất kết nối - đang thử lại";
            color = COLOR_BAD;
            break;
        default:
            /* Chưa có luồng hình: theo kết nối camera ↔ Gateway (ESP-NOW + Local AP) */
            link = cam->link == GW_UI_LINK_OK ? "Đã kết nối, chờ hình" : link_text(cam->link);
            color = cam->link == GW_UI_LINK_NONE ? COLOR_BAD : COLOR_WARN;
            break;
        }
    }
    set_link_ind(&s_cam_link, color, link);

    const char *wait;
    if (cam == NULL) {
        wait = "Chưa ghép camera\n(NVS nodes/<i>_kind = camera)";
    } else if (m->live_state == GW_UI_LIVE_CONNECTING) {
        wait = "Đang kết nối camera...";
    } else if (m->live_state == GW_UI_LIVE_RETRY) {
        wait = "Mất kết nối camera,\nđang thử lại...";
    } else {
        wait = "Chờ camera trực tuyến...";
    }
    if (m->remote_view) {
        lv_obj_clear_flag(s_remote_badge, LV_OBJ_FLAG_HIDDEN);
    } else {
        lv_obj_add_flag(s_remote_badge, LV_OBJ_FLAG_HIDDEN);
    }
    if (cam != NULL && m->live_has_frame && m->live_state != GW_UI_LIVE_OFF) {
        lv_obj_clear_flag(s_live_img, LV_OBJ_FLAG_HIDDEN);
        lv_obj_add_flag(s_live_wait, LV_OBJ_FLAG_HIDDEN);
    } else {
        lv_obj_add_flag(s_live_img, LV_OBJ_FLAG_HIDDEN);
        lv_label_set_text(s_live_wait, wait);
        lv_obj_clear_flag(s_live_wait, LV_OBJ_FLAG_HIDDEN);
    }
}

/*
 * Ô thiết bị: công tắc theo mô hình (xanh khi bật/mở), nền ô xanh sẫm khi bật; khoá khi node chưa báo trạng thái.
 * Công tắc vừa được gạt (hold) giữ nguyên vị trí vừa gạt chờ Node báo lại, để không nhảy về trạng thái cũ.
 */
static void render_actuator(const model_t *m, int i, const char *sub)
{
    const int16_t state = m->act[i];
    const bool known = state != STATE_UNKNOWN;
    const bool on = known && state > 0;
    const bool held = known && esp_timer_get_time() < m->hold_until_us[i];
    if (!held) {
        if (on) {
            lv_obj_add_state(s_act_switch[i], LV_STATE_CHECKED);
        } else {
            lv_obj_clear_state(s_act_switch[i], LV_STATE_CHECKED);
        }
    }
    if (known) {
        lv_obj_clear_state(s_act_switch[i], LV_STATE_DISABLED);
    } else {
        lv_obj_add_state(s_act_switch[i], LV_STATE_DISABLED);
    }
    lv_obj_set_style_bg_color(s_act_tile[i], on ? COLOR_TILE_ON : COLOR_TILE, 0);
    lv_label_set_text(s_act_sub[i], known ? sub : "Node chưa báo");
}

static void render_room(const model_t *m)
{
    const gw_ui_device_t *node = find_room_node(m);
    if (node == NULL) {
        set_link_ind(&s_room_link, COLOR_MUTED, "Chưa ghép node");
    } else {
        set_link_ind(&s_room_link, link_color(node->link), link_text(node->link));
    }

    char v[16];
    fmt_value(v, sizeof(v), m->temperature, 1);
    lv_label_set_text(s_climate_val[0], v);
    fmt_value(v, sizeof(v), m->humidity, 0);
    lv_label_set_text(s_climate_val[1], v);

    char sub[32];
    for (int i = 0; i < ACT_COUNT; i++) {
        const int16_t st = m->act[i];
        sub[0] = '\0';
        /* Trạng thái bật/tắt đã có ở công tắc + nền ô; chỉ còn nhiệt độ đặt của điều hòa. Rèm: nút mức đã nói lên. */
        if (i == ACT_AC && st > 0 && !isnan(m->ac_temp)) {
            fmt_value(v, sizeof(v), m->ac_temp, 0);
            snprintf(sub, sizeof(sub), "Đặt %s°C", v);
        }
        render_actuator(m, i, sub);
    }

    /* Nút mức rèm: nút khớp mức hiện tại (±1 %) tô COLOR_ACCENT; khoá khi chưa biết trạng thái rèm. */
    const int16_t cs = m->act[ACT_CURTAIN];
    for (int i = 0; i < LEVEL_COUNT; i++) {
        const bool match = cs != STATE_UNKNOWN && cs >= CURTAIN_LEVEL[i] - 1 && cs <= CURTAIN_LEVEL[i] + 1;
        lv_obj_set_style_bg_color(s_level_btn[i], match ? COLOR_ACCENT : COLOR_CARD, 0);
        if (cs == STATE_UNKNOWN) {
            lv_obj_add_state(s_level_btn[i], LV_STATE_DISABLED);
        } else {
            lv_obj_clear_state(s_level_btn[i], LV_STATE_DISABLED);
        }
    }

    /* Dòng thông tin: node · ánh sáng · lần cập nhật · tín hiệu */
    char info[200], t[12], lux[16];
    fmt_hms(m->room_ts, t, sizeof(t));
    fmt_value(lux, sizeof(lux), m->light, 0);
    if (node != NULL && node->has_rssi) {
        snprintf(info, sizeof(info), "Node %.32s   |   Ánh sáng %s lux   |   Cập nhật %s   |   %d dBm",
                 node->device_id, lux, t, node->rssi);
    } else {
        snprintf(info, sizeof(info), "Node %.32s   |   Ánh sáng %s lux   |   Cập nhật %s",
                 node ? node->device_id : "--", lux, t);
    }
    lv_label_set_text(s_room_info, info);
}

static void render_devices(const model_t *m)
{
    char buf[48];
    memset(s_dev_row_link, -1, sizeof(s_dev_row_link));   /* -1 = không vẽ chấm */

    if (m->device_count == 0) {
        lv_table_set_row_cnt(s_table, 2);
        table_row_ctrl(1, true);
        lv_table_set_cell_value(s_table, 1, 0, "Chưa ghép thiết bị nào (NVS nodes)");
        for (uint16_t c = 1; c < DEV_COLS; c++) {
            lv_table_set_cell_value(s_table, 1, c, "");
        }
        return;
    }
    lv_table_set_row_cnt(s_table, (uint16_t)(m->device_count + 1));
    for (size_t i = 0; i < m->device_count; i++) {
        const gw_ui_device_t *d = &m->devices[i];
        const uint16_t r = (uint16_t)(i + 1);
        table_row_ctrl(r, false);
        if (strlen(d->device_id) > DEV_ID_SHOW + 1) {
            snprintf(buf, sizeof(buf), "%.*s...", DEV_ID_SHOW, d->device_id);   /* id chỉ gồm ASCII */
            lv_table_set_cell_value(s_table, r, 0, buf);
        } else {
            lv_table_set_cell_value(s_table, r, 0, d->device_id);
        }
        lv_table_set_cell_value(s_table, r, 1, d->is_camera ? "Camera" : "Node");
        lv_table_set_cell_value(s_table, r, DEV_COL_STATUS, "");   /* chỉ chấm màu — on_table_draw_end */
        s_dev_row_link[r] = (int8_t)d->link;
        if (d->has_rssi) {
            snprintf(buf, sizeof(buf), "%d dBm", d->rssi);
            lv_table_set_cell_value(s_table, r, 3, buf);
        } else {
            lv_table_set_cell_value(s_table, r, 3, "--");
        }
        fmt_last_seen(d->last_seen_ts, m->time_synced, buf, sizeof(buf));
        lv_table_set_cell_value(s_table, r, 4, buf);
    }
    lv_obj_invalidate(s_table);   /* chấm màu vẽ ngoài nội dung ô: đổi màu cũng phải vẽ lại */
}

static void render(const model_t *m)
{
    if (m->page != s_shown_page) {
        apply_page(m->page);   /* tầng trên đổi trang (gw_ui_show_page) */
    }
    render_header_footer(m);
    render_nav(m);
    render_camera(m);
    render_room(m);
    render_devices(m);
}

static void refresh_cb(lv_timer_t *timer)
{
    static model_t m;   /* chỉ task LVGL dùng — không chiếm stack */
    bool dirty;
    xSemaphoreTake(s_lock, portMAX_DELAY);
    dirty = s_dirty;
    if (dirty) {
        m = s_model;
        s_dirty = false;
    }
    bool synced = s_model.time_synced;
    xSemaphoreGive(s_lock);

    char t[40];
    static char shown_clock[40];   /* chỉ đặt lại nhãn khi chữ đổi: lv_label_set_text luôn vẽ lại (5 lần/s ở 200 ms) */
    fmt_datetime(synced ? (int64_t)time(NULL) : 0, t, sizeof(t));
    if (strcmp(t, shown_clock) != 0) {
        strlcpy(shown_clock, t, sizeof(shown_clock));
        lv_label_set_text(s_lbl_clock, t);
    }
    if (dirty) {
        render(&m);
    }
}

esp_err_t gw_ui_start(void)
{
    if (s_started) {
        return ESP_OK;
    }
    s_lock = xSemaphoreCreateMutex();
    if (s_lock == NULL) {
        return ESP_ERR_NO_MEM;
    }
    s_model.temperature = s_model.humidity = s_model.light = s_model.ac_temp = NAN;
    for (int i = 0; i < ACT_COUNT; i++) {
        s_model.act[i] = STATE_UNKNOWN;
    }
    s_model.page = GW_UI_PAGE_CAMERA;
    strlcpy(s_model.status, "Đang khởi động...", sizeof(s_model.status));

    /* Thiếu PSRAM thì màn hình vẫn chạy, chỉ không hiện được hình camera. */
    static const gw_live_view_ops_t view_ops = {.is_on = live_is_on, .present = live_present, .shown = live_shown};
    if (gw_live_view_start(LIVE_W, LIVE_H, &view_ops) != ESP_OK) {
        ESP_LOGE(TAG, "live view pipeline not started — camera image will not be shown");
    }

    if (!gw_display_lock(-1)) {
        return ESP_FAIL;
    }
    build_screen();
    lv_timer_create(refresh_cb, REFRESH_MS, NULL);
    gw_display_unlock();
    s_dirty = true;
    s_started = true;
    if (!gw_display_touch_enabled()) {
        ESP_LOGW(TAG, "touch is off — nav cannot be used (CONFIG_EXAMPLE_LCD_TOUCH_CONTROLLER_GT911 in lvgl_port.h)");
    }
    ESP_LOGI(TAG, "UI ready (touch %s)", gw_display_touch_enabled() ? "on" : "off");
    return ESP_OK;
}

/* ---- API cho task khác -------------------------------------------------------------------------------- */

void gw_ui_set_page_handler(gw_ui_page_cb_t cb, void *ctx)
{
    /* Callback được đọc trong task LVGL — đổi dưới khoá LVGL. */
    bool locked = s_started && gw_display_lock(-1);
    s_page_cb = cb;
    s_page_ctx = ctx;
    if (locked) {
        gw_display_unlock();
    }
}

void gw_ui_set_control_handler(gw_ui_control_cb_t cb, void *ctx)
{
    /* Callback được đọc trong task LVGL — đổi dưới khoá LVGL. */
    bool locked = s_started && gw_display_lock(-1);
    s_ctl_cb = cb;
    s_ctl_ctx = ctx;
    if (locked) {
        gw_display_unlock();
    }
}

void gw_ui_control_failed(const char *text)
{
    if (!s_started || text == NULL) {
        return;
    }
    model_update_begin();
    strlcpy(s_model.status, text, sizeof(s_model.status));
    s_model.status_error = true;
    memset(s_model.hold_until_us, 0, sizeof(s_model.hold_until_us));   /* công tắc về trạng thái thật của Node */
    model_update_end();
}

void gw_ui_show_page(gw_ui_page_t page)
{
    if (!s_started || (int)page < 0 || (int)page >= GW_UI_PAGE_COUNT) {
        return;
    }
    model_update_begin();
    s_model.page = page;
    model_update_end();
}

void gw_ui_set_status(const char *text, bool is_error)
{
    if (!s_started || text == NULL) {
        return;
    }
    model_update_begin();
    strlcpy(s_model.status, text, sizeof(s_model.status));
    s_model.status_error = is_error;
    model_update_end();
}

void gw_ui_set_network(bool wifi, const char *ip, bool server, bool time_synced)
{
    if (!s_started) {
        return;
    }
    model_update_begin();
    s_model.wifi = wifi;
    strlcpy(s_model.ip, (wifi && ip) ? ip : "", sizeof(s_model.ip));
    s_model.server = server;
    s_model.time_synced = time_synced;
    model_update_end();
}

/* Số hoặc true/false → true và *out. */
static bool json_number(const cJSON *data, const char *key, double *out)
{
    const cJSON *v = cJSON_GetObjectItemCaseSensitive(data, key);
    if (cJSON_IsNumber(v)) {
        *out = v->valuedouble;
        return true;
    }
    if (cJSON_IsBool(v)) {
        *out = cJSON_IsTrue(v) ? 1.0 : 0.0;
        return true;
    }
    return false;
}

/* Trạng thái thiết bị: ≤ 0 tắt/đóng, 1 bật/mở; rèm cho phép 2..100 (% mở). */
static int16_t to_state(double v, bool percent)
{
    if (!(v > 0.0)) {   /* cả NaN */
        return 0;
    }
    if (!percent || v <= 1.0) {
        return 1;
    }
    return (int16_t)(v >= 100.0 ? 100 : v + 0.5);
}

void gw_ui_set_telemetry(const char *device_id, const char *payload, size_t len)
{
    if (!s_started || payload == NULL) {
        return;
    }
    cJSON *root = cJSON_ParseWithLength(payload, len);
    const cJSON *data = cJSON_GetObjectItemCaseSensitive(root, "data");
    const cJSON *ts = cJSON_GetObjectItemCaseSensitive(root, "sn_timestamp");
    if (cJSON_IsObject(data)) {
        static const char *const act_keys[ACT_COUNT] = {"fan", "ac", "lamp", "curtain"};
        double v;
        model_update_begin();
        strlcpy(s_model.room_dev, device_id ? device_id : "", sizeof(s_model.room_dev));
        /* Chỉ cập nhật trường có mặt: gói chỉ có trạng thái không xoá số đo, và ngược lại. */
        if (json_number(data, "temperature", &v)) {
            s_model.temperature = (float)v;
        }
        if (json_number(data, "humidity", &v)) {
            s_model.humidity = (float)v;
        }
        if (json_number(data, "light", &v)) {
            s_model.light = (float)v;
        }
        if (json_number(data, "ac_temp", &v)) {
            s_model.ac_temp = (float)v;
        }
        for (int i = 0; i < ACT_COUNT; i++) {
            if (json_number(data, act_keys[i], &v)) {
                s_model.act[i] = to_state(v, i == ACT_CURTAIN);
                s_model.hold_until_us[i] = 0;   /* Node đã báo trạng thái mới → công tắc theo Node */
            }
        }
        if (cJSON_IsNumber(ts)) {
            s_model.room_ts = (int64_t)ts->valuedouble;
        }
        model_update_end();
    }
    cJSON_Delete(root);
}

void gw_ui_set_actuator(const char *target, int state)
{
    if (!s_started || target == NULL) {
        return;
    }
    for (int i = 0; i < ACT_COUNT; i++) {
        if (strcmp(target, ACT_TARGET[i]) != 0) {
            continue;
        }
        model_update_begin();
        s_model.act[i] = to_state((double)state, i == ACT_CURTAIN);
        s_model.hold_until_us[i] = 0;   /* ack đã xác nhận → công tắc theo mô hình ngay */
        model_update_end();
        return;
    }
}

void gw_ui_set_devices(const gw_ui_device_t *list, size_t n)
{
    if (!s_started || (list == NULL && n > 0)) {
        return;
    }
    if (n > GW_UI_MAX_DEVICES) {
        n = GW_UI_MAX_DEVICES;
    }
    model_update_begin();
    if (n > 0) {
        memcpy(s_model.devices, list, n * sizeof(*list));
    }
    s_model.device_count = n;
    model_update_end();
}

void gw_ui_set_live(gw_ui_live_state_t state)
{
    if (!s_started) {
        return;
    }
    model_update_begin();
    if (state != GW_UI_LIVE_PLAYING && state != GW_UI_LIVE_RETRY) {
        /* Mở lại / chờ camera: không hiện khung cũ của lần xem trước, đếm khung/giây lại từ đầu. */
        s_model.live_has_frame = false;
        s_model.live_fps_x10 = 0;
    }
    s_model.live_state = state;
    model_update_end();
    atomic_store(&s_live_on, state != GW_UI_LIVE_OFF);
    if (state == GW_UI_LIVE_OFF) {
        gw_live_view_flush();   /* rời trang Camera: khung đang chờ giải nén không còn cần */
    }
}

void gw_ui_set_remote_view(bool active)
{
    if (!s_started) {
        return;
    }
    model_update_begin();
    s_model.remote_view = active;
    model_update_end();
}

esp_err_t gw_ui_live_submit(const uint8_t *jpeg, size_t len, gw_ui_frame_release_t release, void *arg)
{
    if (!s_started) {
        return ESP_ERR_INVALID_STATE;
    }
    return gw_live_view_submit(jpeg, len, release, arg);
}
