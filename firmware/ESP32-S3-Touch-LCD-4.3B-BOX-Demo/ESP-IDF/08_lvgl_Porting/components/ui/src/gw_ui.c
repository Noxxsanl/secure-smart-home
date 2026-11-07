#include "gw_ui.h"

#include <inttypes.h>
#include <math.h>
#include <stdio.h>
#include <string.h>
#include <time.h>

#include "cJSON.h"
#include "esp_log.h"
#include "freertos/FreeRTOS.h"
#include "freertos/semphr.h"
#include "gw_display.h"
#include "lvgl.h"

static const char *TAG = "gw_ui";

#define REFRESH_MS 500
#define STATUS_MAX 96

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
} model_t;

static SemaphoreHandle_t s_lock;
static model_t s_model;
static bool s_dirty;
static bool s_started;

/* ---- widget (chỉ task LVGL truy cập sau khi tạo) ------------------------------------------------------ */

static lv_obj_t *s_lbl_wifi, *s_lbl_server, *s_lbl_clock;
static lv_obj_t *s_lbl_temp, *s_lbl_hum, *s_lbl_light, *s_lbl_climate_at;
static lv_obj_t *s_lbl_motion, *s_lbl_snap;
static lv_obj_t *s_table;
static lv_obj_t *s_lbl_status;

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

/* ---- dựng màn hình ------------------------------------------------------------------------------------ */

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

static lv_obj_t *make_label(lv_obj_t *parent, const lv_font_t *font, lv_coord_t x, lv_coord_t y, const char *text)
{
    lv_obj_t *l = lv_label_create(parent);
    lv_label_set_text(l, text);
    lv_obj_set_style_text_font(l, font, 0);
    lv_obj_set_style_text_color(l, COLOR_TEXT, 0);
    lv_obj_set_pos(l, x, y);
    return l;
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

    /* Camera */
    lv_obj_t *cam = make_card(scr, 406, 48, 384, 190, "CAMERA CUA");
    s_lbl_motion = make_label(cam, FONT_TEXT, 0, 40, "Chuyen dong: chua co");
    s_lbl_snap = make_label(cam, FONT_TEXT, 0, 72, "Anh gan nhat: chua co");
    lv_obj_t *hint = make_label(cam, FONT_TEXT, 0, 146, "Xem truc tiep: chua ho tro");
    lv_obj_set_style_text_color(hint, COLOR_MUTED, 0);

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
        snprintf(buf, sizeof(buf), "Chuyen dong luc %s", t);
        lv_label_set_text(s_lbl_motion, buf);
    }
    if (m->snap_ts > 0) {
        fmt_hms(m->snap_ts, t, sizeof(t));
        snprintf(buf, sizeof(buf), "Anh gan nhat %s, %u KB\n%s", t, (unsigned)((m->snap_bytes + 1023) / 1024),
                 m->snap_uploaded ? "Da gui len Server" : "Chua gui len Server");
        lv_label_set_text(s_lbl_snap, buf);
    }

    lv_table_set_row_cnt(s_table, (uint16_t)(m->device_count + 1));
    for (size_t i = 0; i < m->device_count; i++) {
        const gw_ui_device_t *d = &m->devices[i];
        uint16_t r = (uint16_t)(i + 1);
        char buf[24];
        lv_table_set_cell_value(s_table, r, 0, d->device_id);
        lv_table_set_cell_value(s_table, r, 1, d->is_camera ? "Camera" : "Node");
        lv_table_set_cell_value(s_table, r, 2, d->online ? "Truc tuyen" : "Mat ket noi");
        if (d->seen_ago_s == UINT32_MAX) {
            lv_table_set_cell_value(s_table, r, 3, "--");
            lv_table_set_cell_value(s_table, r, 4, "chua thay");
        } else {
            snprintf(buf, sizeof(buf), "%d", d->rssi);
            lv_table_set_cell_value(s_table, r, 3, buf);
            snprintf(buf, sizeof(buf), "%" PRIu32 " s truoc", d->seen_ago_s);
            lv_table_set_cell_value(s_table, r, 4, buf);
        }
    }

    lv_label_set_text(s_lbl_status, m->status);
    lv_obj_set_style_text_color(s_lbl_status, m->status_error ? COLOR_BAD : COLOR_MUTED, 0);
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

    if (!gw_display_lock(-1)) {
        return ESP_FAIL;
    }
    build_screen();
    lv_timer_create(refresh_cb, REFRESH_MS, NULL);
    gw_display_unlock();
    s_started = true;
    ESP_LOGI(TAG, "UI ready");
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
