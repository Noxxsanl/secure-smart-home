#include "gw_ui.h"

#include <inttypes.h>
#include <math.h>
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
#include "gw_jpeg.h"
#include "lvgl.h"

static const char *TAG = "gw_ui";

#define REFRESH_MS 500
#define STATUS_MAX 96
#define HINT_MAX 64

#define SCREEN_W 800
#define SCREEN_H 480
#define LIVE_W 640            /* VGA vừa màn hình 800x480, còn 160 px cho cột trạng thái (IOT_NODE_NETWORK §5.4) */
#define LIVE_H 480
#define THUMB_W 200           /* ảnh SVGA thu 1/4 */
#define THUMB_H 150
#define LIVE_LOCK_MS 100      /* không lấy kịp khoá LVGL → bỏ khung, không xếp hàng (§5.4) */
#define THUMB_LOCK_MS 500
#define DECODE_WARN_EVERY 100

#if LV_FONT_MONTSERRAT_24
#define FONT_VALUE (&lv_font_montserrat_24)
#else
#define FONT_VALUE LV_FONT_DEFAULT
#endif
#if LV_FONT_MONTSERRAT_20
#define FONT_TITLE (&lv_font_montserrat_20)
#else
#define FONT_TITLE LV_FONT_DEFAULT
#endif
#if LV_FONT_MONTSERRAT_16
#define FONT_TEXT (&lv_font_montserrat_16)
#else
#define FONT_TEXT LV_FONT_DEFAULT
#endif

#define COLOR_BG lv_color_hex(0x10151b)
#define COLOR_CARD lv_color_hex(0x1c242d)
#define COLOR_IMG_BG lv_color_hex(0x0b0f14)
#define COLOR_TEXT lv_color_hex(0xe8edf2)
#define COLOR_MUTED lv_color_hex(0x8a96a3)
#define COLOR_OK lv_color_hex(0x3ecf8e)
#define COLOR_BAD lv_color_hex(0xf06a5b)

/* ---- mô hình (dưới s_lock) ---------------------------------------------------------------------------- */

typedef struct {
    char status[STATUS_MAX];
    bool status_error;
    bool wifi;
    char ip[16];
    bool server;
    bool time_synced;

    bool has_climate;
    char climate_dev[GW_UI_ID_MAX + 1];
    float temperature, humidity, light;   /* NAN = không có */
    int64_t climate_ts;

    int64_t motion_ts;
    size_t snap_bytes;
    int64_t snap_ts;
    bool snap_uploaded;

    gw_ui_device_t devices[GW_UI_MAX_DEVICES];
    size_t device_count;

    gw_ui_live_state_t live_state;
    char live_dev[GW_UI_ID_MAX + 1];
    uint32_t live_close_in_s;
    bool live_has_frame;       /* đã có khung của lần mở này (không hiện khung cũ của lần trước) */
    uint16_t live_fps_x10;
    uint32_t live_session;     /* tăng mỗi lần mở → đếm khung/giây lại từ đầu */
    char live_hint[HINT_MAX];
} model_t;

static SemaphoreHandle_t s_lock;
static model_t s_model;
static bool s_dirty;
static bool s_started;

/* ---- ảnh: 2 bộ đệm RGB565 trong PSRAM — giải nén vào bộ LVGL không vẽ, rồi đổi dưới khoá LVGL ------------ */

typedef struct {
    uint16_t *buf[2];
    lv_img_dsc_t dsc[2];
    int front;                 /* bộ đệm LVGL đang vẽ, -1 = chưa có ảnh; chỉ đổi khi giữ khoá LVGL */
    uint16_t max_w, max_h;
    bool allow_2x;
    gw_jpeg_decoder_t dec;     /* vùng làm việc TJpgDec (SRAM) — mỗi slot chỉ 1 task giải nén */
} frame_slot_t;

static frame_slot_t s_live_slot;    /* task gw_live */
static frame_slot_t s_thumb_slot;   /* task gw_app */

/* ---- widget (chỉ task LVGL truy cập sau khi tạo, hoặc task khác khi giữ khoá LVGL) ---------------------- */

static lv_obj_t *s_lbl_wifi, *s_lbl_server, *s_lbl_clock;
static lv_obj_t *s_lbl_temp, *s_lbl_hum, *s_lbl_light, *s_lbl_climate_at;
static lv_obj_t *s_lbl_motion, *s_lbl_snap, *s_lbl_live_hint;
static lv_obj_t *s_thumb_img, *s_thumb_empty;
static lv_obj_t *s_table;
static lv_obj_t *s_lbl_status;
static lv_obj_t *s_live, *s_live_img, *s_live_wait;
static lv_obj_t *s_live_lbl_dev, *s_live_lbl_state, *s_live_lbl_fps, *s_live_lbl_clock, *s_live_lbl_close;

static gw_ui_live_cb_t s_live_cb;
static void *s_live_ctx;

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

/* ---- bộ đệm ảnh ----------------------------------------------------------------------------------------- */

static bool slot_init(frame_slot_t *s, uint16_t max_w, uint16_t max_h, bool allow_2x)
{
    s->front = -1;
    s->max_w = max_w;
    s->max_h = max_h;
    s->allow_2x = allow_2x;
    const size_t bytes = (size_t)max_w * max_h * sizeof(uint16_t);
    for (int i = 0; i < 2; i++) {
        s->buf[i] = heap_caps_malloc(bytes, MALLOC_CAP_SPIRAM | MALLOC_CAP_8BIT);
        if (s->buf[i] == NULL) {
            free(s->buf[0]);
            s->buf[0] = s->buf[1] = NULL;
            ESP_LOGE(TAG, "no PSRAM for %ux%u image buffers", max_w, max_h);
            return false;
        }
    }
    return true;
}

/*
 * Giải nén vào bộ đệm sau (LVGL không đọc) trong task gọi, rồi đổi nguồn ảnh dưới khoá LVGL. LVGL chỉ vẽ trong
 * lv_timer_handler (giữ khoá), nên sau khi đổi, bộ đệm cũ không còn được đọc và lần sau ghi vào được.
 */
static esp_err_t slot_show(frame_slot_t *s, lv_obj_t *img, lv_obj_t *placeholder, const uint8_t *jpeg, size_t len,
                           int lock_ms)
{
    if (s->buf[0] == NULL || img == NULL) {
        return ESP_ERR_NO_MEM;
    }
    const int back = (s->front == 0) ? 1 : 0;
    uint16_t w = 0, h = 0;
    esp_err_t err = gw_jpeg_decode_rgb565(&s->dec, jpeg, len, s->buf[back], s->max_w, s->max_h, s->allow_2x, &w, &h);
    if (err != ESP_OK) {
        return err;
    }
    lv_img_dsc_t *d = &s->dsc[back];
    memset(d, 0, sizeof(*d));
    d->header.cf = LV_IMG_CF_TRUE_COLOR;
    d->header.w = w;
    d->header.h = h;
    d->data_size = (uint32_t)w * h * sizeof(lv_color_t);
    d->data = (const uint8_t *)s->buf[back];

    if (!gw_display_lock(lock_ms)) {
        return ESP_ERR_TIMEOUT;
    }
    lv_img_set_src(img, d);
    lv_obj_clear_flag(img, LV_OBJ_FLAG_HIDDEN);
    if (placeholder != NULL) {
        lv_obj_add_flag(placeholder, LV_OBJ_FLAG_HIDDEN);
    }
    s->front = back;
    gw_display_unlock();
    return ESP_OK;
}

/* ---- dựng màn hình ------------------------------------------------------------------------------------ */

static void on_live_btn(lv_event_t *e)
{
    const bool open = (uintptr_t)lv_event_get_user_data(e) != 0;
    if (s_live_cb != NULL) {
        s_live_cb(open, s_live_ctx);
    }
}

static lv_obj_t *make_card(lv_obj_t *parent, lv_coord_t x, lv_coord_t y, lv_coord_t w, lv_coord_t h, const char *title)
{
    lv_obj_t *card = lv_obj_create(parent);
    lv_obj_set_pos(card, x, y);
    lv_obj_set_size(card, w, h);
    lv_obj_set_style_bg_color(card, COLOR_CARD, 0);
    lv_obj_set_style_border_width(card, 0, 0);
    lv_obj_set_style_radius(card, 10, 0);
    lv_obj_set_style_pad_all(card, 12, 0);
    lv_obj_clear_flag(card, LV_OBJ_FLAG_SCROLLABLE);

    lv_obj_t *t = lv_label_create(card);
    lv_label_set_text(t, title);
    lv_obj_set_style_text_font(t, FONT_TITLE, 0);
    lv_obj_set_style_text_color(t, COLOR_MUTED, 0);
    lv_obj_align(t, LV_ALIGN_TOP_LEFT, 0, 0);
    return card;
}

/* Khối nền phẳng, không viền/đệm (toạ độ con tính từ góc trên trái). */
static lv_obj_t *make_box(lv_obj_t *parent, lv_coord_t x, lv_coord_t y, lv_coord_t w, lv_coord_t h, lv_color_t bg)
{
    lv_obj_t *o = lv_obj_create(parent);
    lv_obj_remove_style_all(o);
    lv_obj_set_pos(o, x, y);
    lv_obj_set_size(o, w, h);
    lv_obj_set_style_bg_color(o, bg, 0);
    lv_obj_set_style_bg_opa(o, LV_OPA_COVER, 0);
    lv_obj_clear_flag(o, LV_OBJ_FLAG_SCROLLABLE);
    return o;
}

static lv_obj_t *make_label(lv_obj_t *parent, const lv_font_t *font, lv_coord_t x, lv_coord_t y, const char *text)
{
    lv_obj_t *l = lv_label_create(parent);
    lv_label_set_text(l, text);
    lv_obj_set_style_text_font(l, font, 0);
    lv_obj_set_style_text_color(l, COLOR_TEXT, 0);
    lv_obj_set_pos(l, x, y);
    return l;
}

static lv_obj_t *make_wrap_label(lv_obj_t *parent, lv_coord_t x, lv_coord_t y, lv_coord_t w, const char *text)
{
    lv_obj_t *l = make_label(parent, FONT_TEXT, x, y, text);
    lv_obj_set_width(l, w);
    lv_label_set_long_mode(l, LV_LABEL_LONG_WRAP);
    return l;
}

static void make_button(lv_obj_t *parent, lv_coord_t x, lv_coord_t y, lv_coord_t w, lv_coord_t h, const char *text,
                        bool open)
{
    lv_obj_t *b = lv_btn_create(parent);
    lv_obj_set_pos(b, x, y);
    lv_obj_set_size(b, w, h);
    lv_obj_add_event_cb(b, on_live_btn, LV_EVENT_CLICKED, (void *)(uintptr_t)open);
    lv_obj_t *l = lv_label_create(b);
    lv_label_set_text(l, text);
    lv_obj_set_style_text_font(l, FONT_TEXT, 0);
    lv_obj_center(l);
}

/* Màn hình xem trực tiếp: phủ toàn màn hình, ẩn khi không xem. */
static void build_live_view(lv_obj_t *scr)
{
    s_live = make_box(scr, 0, 0, SCREEN_W, SCREEN_H, lv_color_black());
    lv_obj_add_flag(s_live, LV_OBJ_FLAG_CLICKABLE);   /* chặn chạm xuống màn hình bên dưới */
    lv_obj_add_flag(s_live, LV_OBJ_FLAG_HIDDEN);

    lv_obj_t *view = make_box(s_live, 0, 0, LIVE_W, LIVE_H, lv_color_black());
    s_live_wait = lv_label_create(view);
    lv_label_set_text(s_live_wait, "Dang ket noi camera...");
    lv_obj_set_style_text_font(s_live_wait, FONT_TITLE, 0);
    lv_obj_set_style_text_color(s_live_wait, COLOR_MUTED, 0);
    lv_obj_set_style_text_align(s_live_wait, LV_TEXT_ALIGN_CENTER, 0);
    lv_obj_center(s_live_wait);
    s_live_img = lv_img_create(view);
    lv_obj_center(s_live_img);
    lv_obj_add_flag(s_live_img, LV_OBJ_FLAG_HIDDEN);

    const lv_coord_t pw = SCREEN_W - LIVE_W;
    lv_obj_t *panel = make_box(s_live, LIVE_W, 0, pw, SCREEN_H, COLOR_BG);
    make_label(panel, FONT_TITLE, 12, 14, "CAMERA CUA");
    s_live_lbl_dev = make_label(panel, FONT_TEXT, 12, 46, "");
    lv_obj_set_width(s_live_lbl_dev, pw - 24);
    lv_label_set_long_mode(s_live_lbl_dev, LV_LABEL_LONG_DOT);
    lv_obj_set_style_text_color(s_live_lbl_dev, COLOR_MUTED, 0);
    s_live_lbl_state = make_wrap_label(panel, 12, 84, pw - 24, "");
    s_live_lbl_fps = make_label(panel, FONT_TEXT, 12, 146, "");
    s_live_lbl_clock = make_label(panel, FONT_TITLE, 12, 176, "--:--:--");
    s_live_lbl_close = make_wrap_label(panel, 12, 216, pw - 24, "");
    lv_obj_set_style_text_color(s_live_lbl_close, COLOR_MUTED, 0);
    if (gw_display_touch_enabled()) {
        make_button(panel, 12, SCREEN_H - 76, pw - 24, 60, LV_SYMBOL_CLOSE " Dong", false);
    }
}

static void build_screen(void)
{
    lv_obj_t *scr = lv_scr_act();
    lv_obj_clean(scr);
    lv_obj_set_style_bg_color(scr, COLOR_BG, 0);
    lv_obj_set_style_bg_opa(scr, LV_OPA_COVER, 0);
    lv_obj_clear_flag(scr, LV_OBJ_FLAG_SCROLLABLE);

    /* Thanh trên */
    lv_obj_t *title = make_label(scr, FONT_TITLE, 16, 12, "SMART HOME GATEWAY");
    lv_obj_set_style_text_color(title, COLOR_TEXT, 0);
    s_lbl_wifi = make_label(scr, FONT_TEXT, 360, 14, LV_SYMBOL_WIFI " ...");
    s_lbl_server = make_label(scr, FONT_TEXT, 560, 14, LV_SYMBOL_UPLOAD " Server ...");
    s_lbl_clock = make_label(scr, FONT_TITLE, 700, 12, "--:--:--");

    /* Phòng khách (bản sơ bộ: node đầu tiên gửi telemetry) */
    lv_obj_t *room = make_card(scr, 10, 48, 384, 190, "PHONG KHACH");
    s_lbl_temp = make_label(room, FONT_VALUE, 0, 36, "Nhiet do: --");
    s_lbl_hum = make_label(room, FONT_VALUE, 0, 72, "Do am: --");
    s_lbl_light = make_label(room, FONT_VALUE, 0, 108, "Anh sang: --");
    s_lbl_climate_at = make_label(room, FONT_TEXT, 0, 146, "Chua co du lieu");
    lv_obj_set_style_text_color(s_lbl_climate_at, COLOR_MUTED, 0);

    /* Camera: cột chữ bên trái (rộng 156), ảnh chụp gần nhất thu nhỏ bên phải */
    lv_obj_t *cam = make_card(scr, 406, 48, 384, 190, "CAMERA CUA");
    s_lbl_motion = make_wrap_label(cam, 0, 30, 156, "Chuyen dong:\nchua co");
    s_lbl_snap = make_wrap_label(cam, 0, 72, 156, "Anh chup:\nchua co");
    if (gw_display_touch_enabled()) {
        make_button(cam, 0, 124, 152, 40, LV_SYMBOL_VIDEO " Xem truc tiep", true);
    } else {
        s_lbl_live_hint = make_wrap_label(cam, 0, 124, 156, "");
        lv_obj_set_style_text_color(s_lbl_live_hint, COLOR_MUTED, 0);
    }
    lv_obj_t *thumb = make_box(cam, 160, 8, THUMB_W, THUMB_H, COLOR_IMG_BG);
    s_thumb_empty = lv_label_create(thumb);
    lv_label_set_text(s_thumb_empty, "Chua co anh");
    lv_obj_set_style_text_font(s_thumb_empty, FONT_TEXT, 0);
    lv_obj_set_style_text_color(s_thumb_empty, COLOR_MUTED, 0);
    lv_obj_center(s_thumb_empty);
    s_thumb_img = lv_img_create(thumb);
    lv_obj_center(s_thumb_img);
    lv_obj_add_flag(s_thumb_img, LV_OBJ_FLAG_HIDDEN);

    /* Thiết bị */
    lv_obj_t *dev = make_card(scr, 10, 246, 780, 196, "THIET BI");
    s_table = lv_table_create(dev);
    lv_obj_set_pos(s_table, 0, 30);
    lv_obj_set_size(s_table, 756, 140);
    lv_obj_set_style_text_font(s_table, FONT_TEXT, LV_PART_ITEMS);
    lv_obj_set_style_bg_color(s_table, COLOR_CARD, 0);
    lv_obj_set_style_bg_color(s_table, COLOR_CARD, LV_PART_ITEMS);
    lv_obj_set_style_text_color(s_table, COLOR_TEXT, LV_PART_ITEMS);
    lv_obj_set_style_border_width(s_table, 0, 0);
    lv_obj_set_style_pad_ver(s_table, 4, LV_PART_ITEMS);
    lv_table_set_col_cnt(s_table, 5);
    static const lv_coord_t widths[5] = {300, 100, 140, 90, 120};
    static const char *const heads[5] = {"Thiet bi", "Loai", "Trang thai", "RSSI", "Lan cuoi"};
    for (uint16_t c = 0; c < 5; c++) {
        lv_table_set_col_width(s_table, c, widths[c]);
        lv_table_set_cell_value(s_table, 0, c, heads[c]);
    }
    lv_table_set_row_cnt(s_table, 1);

    /* Dòng trạng thái */
    s_lbl_status = make_label(scr, FONT_TEXT, 16, 452, "Dang khoi dong...");
    lv_obj_set_width(s_lbl_status, 768);
    lv_label_set_long_mode(s_lbl_status, LV_LABEL_LONG_DOT);

    /* Tạo sau cùng → nằm trên mọi thứ khác */
    build_live_view(scr);
}

/* ---- vẽ lại từ mô hình (task LVGL, đã giữ khoá LVGL) -------------------------------------------------- */

/* snprintf của newlib (LVGL 8 mặc định không in số thực: LV_SPRINTF_USE_FLOAT = 0). */
static void set_value(lv_obj_t *l, const char *name, float v, const char *unit, int decimals)
{
    char buf[48];
    if (isnan(v)) {
        snprintf(buf, sizeof(buf), "%s: --", name);
    } else {
        snprintf(buf, sizeof(buf), "%s: %.*f %s", name, decimals, (double)v, unit);
    }
    lv_label_set_text(l, buf);
}

static void render_live(const model_t *m)
{
    if (m->live_state == GW_UI_LIVE_OFF) {
        lv_obj_add_flag(s_live, LV_OBJ_FLAG_HIDDEN);
        return;
    }
    lv_obj_clear_flag(s_live, LV_OBJ_FLAG_HIDDEN);
    lv_label_set_text(s_live_lbl_dev, m->live_dev);

    const char *state;
    lv_color_t color;
    switch (m->live_state) {
    case GW_UI_LIVE_PLAYING:
        state = "Truc tiep";
        color = COLOR_OK;
        break;
    case GW_UI_LIVE_RETRY:
        state = "Mat ket noi,\ndang thu lai...";
        color = COLOR_BAD;
        break;
    default:
        state = "Dang ket noi\ncamera...";
        color = COLOR_MUTED;
        break;
    }
    lv_label_set_text(s_live_lbl_state, state);
    lv_obj_set_style_text_color(s_live_lbl_state, color, 0);

    char buf[40] = "";
    if (m->live_state == GW_UI_LIVE_PLAYING && m->live_fps_x10 > 0) {
        snprintf(buf, sizeof(buf), "%u.%u khung/s", m->live_fps_x10 / 10u, m->live_fps_x10 % 10u);
    }
    lv_label_set_text(s_live_lbl_fps, buf);
    buf[0] = '\0';
    if (m->live_close_in_s > 0) {
        snprintf(buf, sizeof(buf), "Tu dong dong\nsau %" PRIu32 " s", m->live_close_in_s);
    }
    lv_label_set_text(s_live_lbl_close, buf);

    if (m->live_has_frame) {
        lv_obj_clear_flag(s_live_img, LV_OBJ_FLAG_HIDDEN);
        lv_obj_add_flag(s_live_wait, LV_OBJ_FLAG_HIDDEN);
    } else {
        lv_obj_add_flag(s_live_img, LV_OBJ_FLAG_HIDDEN);
        lv_label_set_text(s_live_wait, state);
        lv_obj_clear_flag(s_live_wait, LV_OBJ_FLAG_HIDDEN);
    }
}

static void render(const model_t *m)
{
    char buf[96];
    snprintf(buf, sizeof(buf), LV_SYMBOL_WIFI " %s", m->wifi ? m->ip : "Mat ket noi");
    lv_label_set_text(s_lbl_wifi, buf);
    lv_obj_set_style_text_color(s_lbl_wifi, m->wifi ? COLOR_OK : COLOR_BAD, 0);
    lv_label_set_text(s_lbl_server, m->server ? LV_SYMBOL_UPLOAD " Server OK" : LV_SYMBOL_UPLOAD " Server --");
    lv_obj_set_style_text_color(s_lbl_server, m->server ? COLOR_OK : COLOR_BAD, 0);

    char t[12];
    if (m->has_climate) {
        set_value(s_lbl_temp, "Nhiet do", m->temperature, "\xC2\xB0" "C", 1);   /* ° có trong font Montserrat */
        set_value(s_lbl_hum, "Do am", m->humidity, "%", 0);
        set_value(s_lbl_light, "Anh sang", m->light, "lux", 0);
        fmt_hms(m->climate_ts, t, sizeof(t));
        snprintf(buf, sizeof(buf), "Cap nhat %s  (%.24s)", t, m->climate_dev);
        lv_label_set_text(s_lbl_climate_at, buf);
    }
    if (m->motion_ts > 0) {
        fmt_hms(m->motion_ts, t, sizeof(t));
        snprintf(buf, sizeof(buf), "Chuyen dong luc\n%s", t);
        lv_label_set_text(s_lbl_motion, buf);
    }
    if (m->snap_ts > 0) {
        fmt_hms(m->snap_ts, t, sizeof(t));
        snprintf(buf, sizeof(buf), "Anh chup %s\n%u KB - %s", t, (unsigned)((m->snap_bytes + 1023) / 1024),
                 m->snap_uploaded ? "da gui" : "chua gui");
        lv_label_set_text(s_lbl_snap, buf);
    }
    if (s_lbl_live_hint != NULL) {
        lv_label_set_text(s_lbl_live_hint, m->live_hint);
    }

    lv_table_set_row_cnt(s_table, (uint16_t)(m->device_count + 1));
    for (size_t i = 0; i < m->device_count; i++) {
        const gw_ui_device_t *d = &m->devices[i];
        uint16_t r = (uint16_t)(i + 1);
        char cell[24];
        lv_table_set_cell_value(s_table, r, 0, d->device_id);
        lv_table_set_cell_value(s_table, r, 1, d->is_camera ? "Camera" : "Node");
        lv_table_set_cell_value(s_table, r, 2, d->online ? "Truc tuyen" : "Mat ket noi");
        if (d->seen_ago_s == UINT32_MAX) {
            lv_table_set_cell_value(s_table, r, 3, "--");
            lv_table_set_cell_value(s_table, r, 4, "chua thay");
        } else {
            snprintf(cell, sizeof(cell), "%d", d->rssi);
            lv_table_set_cell_value(s_table, r, 3, cell);
            snprintf(cell, sizeof(cell), "%" PRIu32 " s truoc", d->seen_ago_s);
            lv_table_set_cell_value(s_table, r, 4, cell);
        }
    }

    lv_label_set_text(s_lbl_status, m->status);
    lv_obj_set_style_text_color(s_lbl_status, m->status_error ? COLOR_BAD : COLOR_MUTED, 0);

    render_live(m);
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

    char t[12];
    fmt_hms(synced ? (int64_t)time(NULL) : 0, t, sizeof(t));
    lv_label_set_text(s_lbl_clock, t);
    if (!lv_obj_has_flag(s_live, LV_OBJ_FLAG_HIDDEN)) {
        lv_label_set_text(s_live_lbl_clock, t);
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
    s_model.temperature = s_model.humidity = s_model.light = NAN;
    strlcpy(s_model.status, "Dang khoi dong...", sizeof(s_model.status));

    /* Thiếu PSRAM thì màn hình vẫn chạy, chỉ không hiện được ảnh camera. */
    slot_init(&s_live_slot, LIVE_W, LIVE_H, true);
    slot_init(&s_thumb_slot, THUMB_W, THUMB_H, false);

    if (!gw_display_lock(-1)) {
        return ESP_FAIL;
    }
    build_screen();
    lv_timer_create(refresh_cb, REFRESH_MS, NULL);
    gw_display_unlock();
    s_started = true;
    ESP_LOGI(TAG, "UI ready (touch %s)", gw_display_touch_enabled() ? "on" : "off");
    return ESP_OK;
}

/* ---- API cho task khác -------------------------------------------------------------------------------- */

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

static float json_float(const cJSON *data, const char *key)
{
    const cJSON *v = cJSON_GetObjectItemCaseSensitive(data, key);
    return cJSON_IsNumber(v) ? (float)v->valuedouble : NAN;
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
        model_update_begin();
        s_model.has_climate = true;
        strlcpy(s_model.climate_dev, device_id ? device_id : "", sizeof(s_model.climate_dev));
        s_model.temperature = json_float(data, "temperature");
        s_model.humidity = json_float(data, "humidity");
        s_model.light = json_float(data, "light");
        s_model.climate_ts = cJSON_IsNumber(ts) ? (int64_t)ts->valuedouble : 0;
        model_update_end();
    }
    cJSON_Delete(root);
}

void gw_ui_set_motion(const char *device_id, int64_t ts)
{
    if (!s_started) {
        return;
    }
    model_update_begin();
    s_model.motion_ts = ts;
    model_update_end();
}

void gw_ui_set_snapshot(const char *device_id, size_t bytes, int64_t ts, bool uploaded)
{
    if (!s_started) {
        return;
    }
    model_update_begin();
    s_model.snap_bytes = bytes;
    s_model.snap_ts = ts;
    s_model.snap_uploaded = uploaded;
    model_update_end();
}

esp_err_t gw_ui_set_snapshot_image(const uint8_t *jpeg, size_t len)
{
    if (!s_started) {
        return ESP_ERR_INVALID_STATE;
    }
    esp_err_t err = slot_show(&s_thumb_slot, s_thumb_img, s_thumb_empty, jpeg, len, THUMB_LOCK_MS);
    if (err != ESP_OK) {
        ESP_LOGW(TAG, "snapshot (%u bytes) not shown: %s", (unsigned)len, esp_err_to_name(err));
    }
    return err;
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

void gw_ui_set_live_handler(gw_ui_live_cb_t cb, void *ctx)
{
    /* Callback được đọc trong task LVGL — đổi dưới khoá LVGL. */
    bool locked = s_started && gw_display_lock(-1);
    s_live_cb = cb;
    s_live_ctx = ctx;
    if (locked) {
        gw_display_unlock();
    }
}

void gw_ui_set_live_hint(const char *text)
{
    if (!s_started) {
        return;
    }
    model_update_begin();
    strlcpy(s_model.live_hint, text ? text : "", sizeof(s_model.live_hint));
    model_update_end();
}

void gw_ui_set_live(gw_ui_live_state_t state, const char *device_id, uint32_t close_in_s)
{
    if (!s_started) {
        return;
    }
    model_update_begin();
    if (s_model.live_state == GW_UI_LIVE_OFF && state != GW_UI_LIVE_OFF) {
        s_model.live_has_frame = false;   /* không hiện khung cũ của lần xem trước */
        s_model.live_fps_x10 = 0;
        s_model.live_session++;
    }
    s_model.live_state = state;
    strlcpy(s_model.live_dev, device_id ? device_id : "", sizeof(s_model.live_dev));
    s_model.live_close_in_s = close_in_s;
    model_update_end();
}

esp_err_t gw_ui_live_frame(const uint8_t *jpeg, size_t len)
{
    /* Chỉ 1 task gọi (gw_live) → biến tĩnh không cần khoá. */
    static uint32_t session;
    static int64_t window_us;
    static uint32_t window_frames;
    static uint32_t failures;

    if (!s_started) {
        return ESP_ERR_INVALID_STATE;
    }
    xSemaphoreTake(s_lock, portMAX_DELAY);
    const bool on = s_model.live_state != GW_UI_LIVE_OFF;
    const uint32_t cur = s_model.live_session;
    xSemaphoreGive(s_lock);
    if (!on) {
        return ESP_ERR_INVALID_STATE;
    }
    if (cur != session) {
        session = cur;
        window_us = 0;
        window_frames = 0;
    }

    const int64_t t0 = esp_timer_get_time();
    esp_err_t err = slot_show(&s_live_slot, s_live_img, s_live_wait, jpeg, len, LIVE_LOCK_MS);
    if (err != ESP_OK) {
        if (failures++ % DECODE_WARN_EVERY == 0) {
            ESP_LOGW(TAG, "live frame (%u bytes) not shown: %s", (unsigned)len, esp_err_to_name(err));
        }
        return err;
    }
    const int64_t now = esp_timer_get_time();
    ESP_LOGD(TAG, "live frame %u bytes decoded+shown in %d ms", (unsigned)len, (int)((now - t0) / 1000));

    if (window_us == 0) {
        window_us = now;
    }
    window_frames++;
    const int64_t span = now - window_us;

    xSemaphoreTake(s_lock, portMAX_DELAY);
    bool changed = !s_model.live_has_frame;
    s_model.live_has_frame = true;
    if (span >= 1000000) {
        s_model.live_fps_x10 = (uint16_t)((int64_t)window_frames * 10000000 / span);
        window_us = now;
        window_frames = 0;
        changed = true;
    }
    if (changed) {
        s_dirty = true;   /* chỉ vẽ lại chữ khi có thay đổi — không vẽ lại cả màn hình mỗi khung */
    }
    xSemaphoreGive(s_lock);
    return ESP_OK;
}
