#include "gw_app.h"

#include <inttypes.h>
#include <stdatomic.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <time.h>

#include "esp_event.h"
#include "esp_log.h"
#include "esp_netif.h"
#include "esp_ota_ops.h"
#include "esp_system.h"
#include "esp_timer.h"
#include "freertos/FreeRTOS.h"
#include "freertos/queue.h"
#include "freertos/task.h"
#include "nvs_flash.h"
#include "sdkconfig.h"

#include "gw_display.h"
#include "gw_rtc.h"

#include "gw_api.h"
#include "gw_camera_live.h"
#include "gw_camera_relay.h"
#include "gw_config.h"
#include "gw_envelope.h"
#include "gw_espnow.h"
#include "gw_local_http.h"
#include "gw_mqtt.h"
#include "gw_registry.h"
#include "gw_time.h"
#include "gw_wifi.h"

#include "gw_ui.h"

static const char *TAG = "gw_app";

#define APP_QUEUE_LEN 16
#define UPLINK_QUEUE_LEN 6
#define APP_TICK_MS 200
#define APP_TASK_STACK 6144
#define UPLINK_TASK_STACK 8192    /* bắt tay TLS của esp_http_client chạy trên stack của task gọi */
#define PENDING_MAX 8
#define PAYLOAD_MAX 250
#define ID_MAX 64
#define ACTION_MAX 32
#define NET_REFRESH_US (1000 * 1000)
#define DEVICES_REFRESH_US (2 * 1000 * 1000)
#define SEEN_SAVE_CHECK_US (60 * 1000 * 1000LL)   /* kiểm "lần cuối kết nối" cần ghi NVS chưa */
#define LINK_BOOT_GRACE_US (60 * 1000 * 1000LL)   /* sau khởi động: thiết bị chưa gửi gói vẫn tính "đang kết nối" */
#define HEARTBEAT_US ((int64_t)CONFIG_GW_HEARTBEAT_INTERVAL_S * 1000 * 1000)
#define ACK_TIMEOUT_US ((int64_t)CONFIG_GW_NODE_ACK_TIMEOUT_MS * 1000)
/* Học mã IR (learn_off, learn_t<NN>): node chờ người dùng bấm remote tới 10 s rồi mới ack (Server chờ 15 s). */
#define LEARN_ACK_TIMEOUT_US ((int64_t)14000 * 1000)
#define MOTION_WAIT_US ((int64_t)CONFIG_GW_MOTION_SNAPSHOT_WAIT_S * 1000 * 1000)
#define LOCAL_TZ "<+07>-7"        /* giờ Việt Nam cho màn hình; giờ hệ thống và HMAC vẫn là UTC */
#define LIVE_REOPEN_MIN_US (5 * 1000 * 1000LL)    /* luồng hỏng hẳn: thử mở lại sau 5 s, */
#define LIVE_REOPEN_MAX_US (60 * 1000 * 1000LL)   /* hỏng liên tiếp thì lùi dần tới 60 s */
#define MOTION_PAGE_US ((int64_t)CONFIG_GW_CAMERA_LIVE_ON_MOTION_S * 1000 * 1000)
#define STATUS_MAX 160   /* UTF-8: chữ có dấu chiếm 2–3 byte */

#if CONFIG_GW_UI_START_PAGE_ROOM
#define START_PAGE GW_UI_PAGE_ROOM
#elif CONFIG_GW_UI_START_PAGE_DEVICES
#define START_PAGE GW_UI_PAGE_DEVICES
#else
#define START_PAGE GW_UI_PAGE_CAMERA
#endif

/* ---- sự kiện từ các task khác → task gw_app ----------------------------------------------------------- */

typedef enum {
    EV_TELEMETRY,
    EV_NODE_EVENT,
    EV_CMD_ACK,
    EV_SNAPSHOT,
    EV_DEVICE_CMD,
    EV_GATEWAY_CMD,
    EV_PAGE,         /* người dùng chạm 1 mục trên nav */
    EV_LIVE_STATE,   /* gw_camera_live đổi trạng thái */
    EV_RELAY_ENDED,  /* phiên xem từ xa tự kết thúc (Server đóng, bị từ chối, hết số lần nối lại) */
} ev_type_t;

typedef struct {
    ev_type_t type;
    union {
        struct {
            size_t idx;
            uint16_t len;
            char payload[PAYLOAD_MAX + 1];
        } tel;
        struct {
            size_t idx;
            char event[ACTION_MAX + 1];
            int64_t ts;
        } nev;
        struct {
            size_t idx;
            char command_id[ID_MAX + 1];
            bool ok;
            int power;
        } ack;
        gw_snapshot_t snap;
        struct {
            char home[GW_HOME_ID_MAX + 1];
            char device_id[ID_MAX + 1];
            char command_id[ID_MAX + 1];
            char action[ACTION_MAX + 1];
        } dcmd;
        struct {
            char home[GW_HOME_ID_MAX + 1];
            char command_id[ID_MAX + 1];
            char action[ACTION_MAX + 1];
        } gcmd;
        struct {
            gw_ui_page_t page;
        } nav;
        struct {
            size_t idx;
            gw_live_state_t state;
            gw_live_err_t err;
            int http_status;
        } lst;
    };
} app_event_t;

/* ---- việc chặn lâu → task gw_uplink ------------------------------------------------------------------- */

typedef enum {
    UP_TELEMETRY,   /* POST /api/device/data khi MQTT mất kết nối */
    UP_SNAPSHOT,    /* POST /api/device/camera/snapshot (đề xuất) */
} up_type_t;

typedef struct {
    up_type_t type;
    char *json;                       /* UP_TELEMETRY — free() sau khi gửi */
    gw_snapshot_t snap;               /* UP_SNAPSHOT — snap.jpeg free() sau khi gửi */
    bool with_event;                  /* publish camera/event sau khi gửi ảnh */
    int64_t event_ts;
    char home[GW_HOME_ID_MAX + 1];    /* "" = chưa biết home_id */
} uplink_job_t;

/* Lệnh đã chuyển xuống node, chờ CMD_ACK. */
typedef struct {
    bool used;
    char command_id[ID_MAX + 1];
    char home[GW_HOME_ID_MAX + 1];
    char device_id[ID_MAX + 1];   /* UID trong topic lệnh — ack trả về topic này (node hoặc "<node>-ac") */
    size_t idx;
    int64_t deadline_us;
} pending_t;

/* Camera báo chuyển động, chờ ảnh để gửi kèm. */
typedef struct {
    bool active;
    int64_t ts;
    int64_t since_us;
} motion_t;

static gw_config_t s_cfg;
static QueueHandle_t s_app_q;
static QueueHandle_t s_up_q;
static bool s_api_ok;

/* Chỉ task gw_app truy cập. */
static char s_home_id[GW_HOME_ID_MAX + 1];
static pending_t s_pending[PENDING_MAX];
static motion_t s_motion[GW_REGISTRY_MAX];

/*
 * Màn hình + xem trực tiếp (chỉ task gw_app, trừ 2 biến atomic). MỘT luồng camera duy nhất (gw_camera_live) cho 2 nơi:
 *   LCD    khi đang ở trang Camera — khung được giải nén và hiện (gw_ui_live_submit)
 *   relay  khi có phiên xem từ xa (lệnh live_start của Server) — khung JPEG nguyên vẹn gửi lên Server (gw_camera_relay)
 * Luồng chạy khi MỘT TRONG HAI cần; chỉ giải nén khi LCD đang xem.
 */
static gw_ui_page_t s_page = START_PAGE;     /* trang đang hiện */
static gw_ui_page_t s_page_before_motion;    /* trang trước khi tự chuyển sang Camera vì chuyển động */
static int64_t s_page_return_at_us;          /* 0 = không tự quay lại trang cũ */
static int s_live_idx = -1;                  /* camera đang kéo luồng, -1 = không */
static atomic_int s_lcd_cam = -1;            /* camera mà LCD đang xem (trang Camera), -1 = LCD không xem — task gw_live đọc */
static atomic_int s_relay_cam = -1;          /* camera của phiên xem từ xa, -1 = không có phiên — task gw_live đọc */
static bool s_remote_ui;                     /* nhãn "Đang được xem từ xa" đang bật */
static gw_ui_live_state_t s_stream_ui = GW_UI_LIVE_WAITING;   /* trạng thái thật của luồng, để LCD hiện khi vào trang Camera */
static gw_ui_live_state_t s_live_ui = GW_UI_LIVE_OFF;         /* trạng thái đã báo cho ui */
static int64_t s_live_reopen_at_us;          /* luồng hỏng hẳn: chưa mở lại trước thời điểm này */
static int s_live_failures;                  /* số lần hỏng hẳn liên tiếp */
static char s_ready_status[STATUS_MAX];   /* dòng trạng thái lúc khởi động xong — khôi phục khi luồng chạy lại */
static bool s_ready_status_error;
static bool s_status_by_live;              /* dòng trạng thái đang là lỗi xem trực tiếp */

/* ==== callback từ services (chạy trong task của services — chỉ chép và đẩy vào hàng đợi) ================= */

static void post(const app_event_t *ev, const char *what)
{
    if (xQueueSend(s_app_q, ev, 0) != pdTRUE) {
        ESP_LOGW(TAG, "app queue full — drop %s", what);
    }
}

static void on_telemetry(size_t idx, const char *payload, size_t len, void *ctx)
{
    if (len > PAYLOAD_MAX) {
        return;
    }
    app_event_t ev = {.type = EV_TELEMETRY, .tel = {.idx = idx, .len = (uint16_t)len}};
    memcpy(ev.tel.payload, payload, len);
    ev.tel.payload[len] = '\0';
    post(&ev, "telemetry");
}

static void on_node_event(size_t idx, const char *event, int64_t ts, void *ctx)
{
    app_event_t ev = {.type = EV_NODE_EVENT, .nev = {.idx = idx, .ts = ts}};
    strlcpy(ev.nev.event, event, sizeof(ev.nev.event));
    post(&ev, "event");
}

static void on_cmd_ack(size_t idx, const char *command_id, bool ok, int power, void *ctx)
{
    app_event_t ev = {.type = EV_CMD_ACK, .ack = {.idx = idx, .ok = ok, .power = power}};
    strlcpy(ev.ack.command_id, command_id, sizeof(ev.ack.command_id));
    post(&ev, "cmd ack");
}

static bool on_snapshot(gw_snapshot_t *snap, void *ctx)
{
    app_event_t ev = {.type = EV_SNAPSHOT, .snap = *snap};
    return xQueueSend(s_app_q, &ev, 0) == pdTRUE;   /* false → Local HTTP trả 503 và tự giải phóng ảnh */
}

static void on_device_cmd(const char *home, const char *device_id, const char *command_id, const char *action,
                          int64_t ts, void *ctx)
{
    app_event_t ev = {.type = EV_DEVICE_CMD};
    strlcpy(ev.dcmd.home, home, sizeof(ev.dcmd.home));
    strlcpy(ev.dcmd.device_id, device_id, sizeof(ev.dcmd.device_id));
    strlcpy(ev.dcmd.command_id, command_id, sizeof(ev.dcmd.command_id));
    strlcpy(ev.dcmd.action, action, sizeof(ev.dcmd.action));
    post(&ev, "device command");
}

static void on_gateway_cmd(const char *home, const char *command_id, const char *action, void *ctx)
{
    app_event_t ev = {.type = EV_GATEWAY_CMD};
    strlcpy(ev.gcmd.home, home, sizeof(ev.gcmd.home));
    strlcpy(ev.gcmd.command_id, command_id, sizeof(ev.gcmd.command_id));
    strlcpy(ev.gcmd.action, action, sizeof(ev.gcmd.action));
    post(&ev, "gateway command");
}

static void on_ota_cmd(const char *home, const char *job_id, const char *version, void *ctx)
{
    /* TODO: OTA (Firmware §14) — tải ảnh qua HTTPS, kiểm checksum_sha256, ghi slot còn lại, báo ota/progress. */
    ESP_LOGW(TAG, "OTA job %s (version %s) received and verified — OTA not implemented yet", job_id, version);
}

static void on_mqtt_connection(bool connected, void *ctx)
{
    ESP_LOGI(TAG, "server %s", connected ? "online" : "offline");
}

static void frame_release(void *arg)
{
    gw_live_frame_release((gw_live_frame_t *)arg);
}

/*
 * Task gw_live, mỗi khung JPEG: chỉ chia con trỏ cho nơi cần, không giải nén/không gửi mạng ở đây (đọc luồng không
 * được chờ ai). Mỗi nơi giữ khung bằng tham chiếu và chỉ giữ khung mới nhất (ui: gw_ui_live_submit, relay: offer).
 */
static void on_live_frame(size_t idx, gw_live_frame_t *frame, void *ctx)
{
    if ((int)idx == atomic_load(&s_relay_cam)) {
        gw_camera_relay_offer(frame);
    }
    if ((int)idx == atomic_load(&s_lcd_cam)) {
        gw_live_frame_ref(frame);
        if (gw_ui_live_submit(frame->data, frame->len, frame_release, frame) != ESP_OK) {
            gw_live_frame_release(frame);   /* ui không nhận (luồng LCD vừa tắt) */
        }
    }
}

/* Task gw_relay — chỉ đẩy vào hàng đợi. */
static void on_relay_ended(void *ctx)
{
    app_event_t ev = {.type = EV_RELAY_ENDED};
    post(&ev, "relay ended");
}

static void on_live_state(size_t idx, gw_live_state_t state, gw_live_err_t err, int http_status, void *ctx)
{
    app_event_t ev = {.type = EV_LIVE_STATE, .lst = {.idx = idx, .state = state, .err = err, .http_status = http_status}};
    post(&ev, "live state");
}

/* Task LVGL (đang giữ khoá LVGL) — chỉ đẩy vào hàng đợi. */
static void on_ui_page(gw_ui_page_t page, void *ctx)
{
    app_event_t ev = {.type = EV_PAGE, .nav = {.page = page}};
    post(&ev, "page change");
}

/* ==== xử lý trong task gw_app ============================================================================ */

static void learn_home(const char *home)
{
    /* home_id lấy từ topic lệnh đã kiểm HMAC gateway → do Backend gửi; Backend gán lại nhà thì theo nhà mới. */
    if (strcmp(s_home_id, home) != 0) {
        ESP_LOGI(TAG, "home_id %s (from signed command)", home);
        strlcpy(s_home_id, home, sizeof(s_home_id));
    }
}

static void publish_ack(const char *home, const char *device_id, const char *command_id, bool ok, int power)
{
    char *json = gw_envelope_ack(command_id, ok, power);
    if (json == NULL) {
        ESP_LOGW(TAG, "ack %s: cannot build payload", command_id);
        return;
    }
    esp_err_t err = gw_mqtt_publish_ack(home, device_id, json);
    free(json);
    ESP_LOGI(TAG, "ack %s → %s%s", command_id, ok ? "ok" : "error", err == ESP_OK ? "" : " (not sent: MQTT down)");
}

static void publish_camera_event(const char *home, const char *device_id, int64_t ts, const char *snapshot_id)
{
    if (home[0] == '\0') {
        ESP_LOGW(TAG, "camera/event not sent: home_id unknown (set NVS cloud/home_id or wait for a command)");
        return;
    }
    char *json = gw_envelope_camera_event(device_id, "motion", ts, snapshot_id);
    if (json == NULL) {
        return;
    }
    if (gw_mqtt_publish_camera_event(home, device_id, json) != ESP_OK) {
        ESP_LOGW(TAG, "camera/event not sent: MQTT down");
    }
    free(json);
}

/* ---- xem trực tiếp camera (IOT_NODE_NETWORK §5.4) ---------------------------------------------------- */

static int first_camera(void)
{
    for (size_t i = 0; i < gw_registry_count(); i++) {
        if (gw_registry_get(i)->kind == GW_DEV_CAMERA) {
            return (int)i;
        }
    }
    return -1;
}

/* Chỉ báo màn hình khi trạng thái đổi (mỗi lần báo, ui bắt đầu lại "chưa có khung"). */
static void live_ui(gw_ui_live_state_t state)
{
    if (state != s_live_ui) {
        s_live_ui = state;
        gw_ui_set_live(state);
    }
}

/* Trạng thái THẬT của luồng; LCD chỉ hiện khi đang ở trang Camera, ngoài ra OFF (ui bỏ khung, không giải nén). */
static void stream_ui(gw_ui_live_state_t state)
{
    s_stream_ui = state;
    live_ui(s_page == GW_UI_PAGE_CAMERA ? state : GW_UI_LIVE_OFF);
}

static void relay_source(gw_relay_source_t src)
{
    if (gw_camera_relay_active()) {
        gw_camera_relay_set_source(src);
    }
}

static void live_open(int idx, const char *why)
{
    if (s_live_idx == idx) {
        return;
    }
    const gw_device_info_t *dev = gw_registry_get((size_t)idx);
    if (gw_camera_live_start((size_t)idx) != ESP_OK) {
        ESP_LOGW(TAG, "live view of %s unavailable", dev->device_id);
        return;
    }
    s_live_idx = idx;
    ESP_LOGI(TAG, "live view %s (%s)", dev->device_id, why);
    stream_ui(GW_UI_LIVE_CONNECTING);
    relay_source(GW_RELAY_SRC_CONNECTING);
}

static void live_close(const char *why)
{
    if (s_live_idx < 0) {
        return;
    }
    ESP_LOGI(TAG, "live view closed (%s)", why);
    gw_camera_live_stop();
    s_live_idx = -1;
    s_stream_ui = GW_UI_LIVE_WAITING;
}

/* Hướng dẫn trên dòng trạng thái khi không mở được luồng (bất biến 10: không hiện mã thô). */
static void live_show_failure(gw_live_err_t err, int http_status)
{
    char msg[STATUS_MAX];
    switch (err) {
    case GW_LIVE_ERR_NOT_ON_AP:
        strlcpy(msg, "Camera chưa vào Local AP: kiểm tra nguồn và wifi/ssid, password của camera", sizeof(msg));
        break;
    case GW_LIVE_ERR_NO_TIME:
        strlcpy(msg, "Gateway chưa có giờ (NTP/RTC) nên chưa mở được luồng camera", sizeof(msg));
        break;
    case GW_LIVE_ERR_AUTH:
        strlcpy(msg, "Camera từ chối chữ ký: secret camera trong NVS Gateway (nodes) không khớp", sizeof(msg));
        break;
    case GW_LIVE_ERR_BUSY:
        strlcpy(msg, "Camera đang phát cho kết nối khác - thử lại sau ít giây", sizeof(msg));
        break;
    case GW_LIVE_ERR_CAM_NO_TIME:
        strlcpy(msg, "Camera chưa có giờ: kiểm tra ghép nối ESP-NOW (gateway_mac, LMK)", sizeof(msg));
        break;
    case GW_LIVE_ERR_HTTP:
        snprintf(msg, sizeof(msg), "Camera trả lời HTTP %d khi mở luồng trực tiếp", http_status);
        break;
    default:
        strlcpy(msg, "Mất kết nối camera - kiểm tra nguồn và sóng WiFi của camera", sizeof(msg));
        break;
    }
    ESP_LOGW(TAG, "live view failed: %s", msg);
    gw_ui_set_status(msg, true);
    s_status_by_live = true;
}

static void handle_live_state(const app_event_t *ev)
{
    if ((int)ev->lst.idx != s_live_idx) {
        return;   /* sự kiện của lần xem trước / camera khác */
    }
    switch (ev->lst.state) {
    case GW_LIVE_CONNECTING:
        stream_ui(GW_UI_LIVE_CONNECTING);
        relay_source(GW_RELAY_SRC_CONNECTING);
        break;
    case GW_LIVE_STREAMING:
        s_live_failures = 0;
        stream_ui(GW_UI_LIVE_PLAYING);
        relay_source(GW_RELAY_SRC_STREAMING);
        if (s_status_by_live) {
            gw_ui_set_status(s_ready_status, s_ready_status_error);
            s_status_by_live = false;
        }
        break;
    case GW_LIVE_RETRYING:
        stream_ui(GW_UI_LIVE_RETRY);
        relay_source(GW_RELAY_SRC_UNAVAILABLE);
        break;
    case GW_LIVE_FAILED: {
        live_show_failure(ev->lst.err, ev->lst.http_status);
        s_live_idx = -1;   /* service đã tự dừng */
        /* Thử mở lại sau 5, 10, 20… tối đa 60 s — không nháy màn hình liên tục khi lỗi cấu hình. */
        int64_t wait_us = LIVE_REOPEN_MIN_US << (s_live_failures < 4 ? s_live_failures : 4);
        if (wait_us > LIVE_REOPEN_MAX_US) {
            wait_us = LIVE_REOPEN_MAX_US;
        }
        s_live_failures++;
        s_live_reopen_at_us = esp_timer_get_time() + wait_us;
        stream_ui(GW_UI_LIVE_WAITING);
        relay_source(GW_RELAY_SRC_UNAVAILABLE);
        break;
    }
    case GW_LIVE_STOPPED:
        break;   /* do chính gw_app dừng (hết người xem) */
    }
}

/* Camera `cam` đã vào Local AP và Gateway ký được yêu cầu (có giờ) → mở luồng mới có nghĩa. */
static bool camera_reachable(int cam)
{
    esp_ip4_addr_t ip;
    return cam >= 0 && gw_time_is_synced() && gw_wifi_ap_client_ip(gw_registry_get((size_t)cam)->mac, &ip);
}

static void set_remote_ui(bool on)
{
    if (on != s_remote_ui) {
        s_remote_ui = on;
        gw_ui_set_remote_view(on);
    }
}

/*
 * Một luồng camera duy nhất, chạy khi LCD đang ở trang Camera HOẶC có phiên xem từ xa (relay); chỉ giải nén khi LCD xem
 * (on_live_frame đọc s_lcd_cam). Gọi khi đổi trang, khi phiên xem từ xa đổi, và mỗi giây (camera vừa vào Local AP / tới
 * lượt thử lại).
 */
static void live_sync(void)
{
    const bool lcd = s_page == GW_UI_PAGE_CAMERA;
    if (atomic_load(&s_relay_cam) >= 0 && !gw_camera_relay_active()) {
        atomic_store(&s_relay_cam, -1);   /* phiên đã kết thúc (Server đóng / hết số lần nối lại) */
    }
    const int relay = atomic_load(&s_relay_cam);
    set_remote_ui(relay >= 0);
    const int lcd_cam = lcd ? first_camera() : -1;
    atomic_store(&s_lcd_cam, lcd_cam);
    live_ui(lcd ? s_stream_ui : GW_UI_LIVE_OFF);

    const int want = relay >= 0 ? relay : lcd_cam;
    if (want < 0) {
        live_close(lcd ? "no camera paired" : "no viewer");
        return;   /* trang Camera mà chưa ghép camera: ui tự hiện "Chưa ghép camera" */
    }
    if (s_live_idx >= 0 && s_live_idx != want) {
        live_close("camera changed");
    }
    if (s_live_idx >= 0) {
        return;
    }
    if (esp_timer_get_time() < s_live_reopen_at_us || !camera_reachable(want)) {
        stream_ui(GW_UI_LIVE_WAITING);
        relay_source(GW_RELAY_SRC_UNAVAILABLE);
        return;
    }
    live_open(want, relay >= 0 ? "remote view" : "camera page");
}

/* gw_app tự đổi trang (chuyển động, hết giờ quay lại). */
static void show_page(gw_ui_page_t page)
{
    s_page = page;
    gw_ui_show_page(page);
    live_sync();
}

/* Người dùng chạm nav: màn hình đã đổi trang; không tự quay lại trang cũ nữa. */
static void handle_page(const app_event_t *ev)
{
    s_page = ev->nav.page;
    s_page_return_at_us = 0;
    live_sync();
}

/* Camera báo chuyển động: hiện trang Camera, sau CONFIG_GW_CAMERA_LIVE_ON_MOTION_S giây quay lại trang cũ. */
static void motion_show_camera(void)
{
    if (CONFIG_GW_CAMERA_LIVE_ON_MOTION_S == 0) {
        return;
    }
    if (s_page != GW_UI_PAGE_CAMERA) {
        s_page_before_motion = s_page;
        s_page_return_at_us = esp_timer_get_time() + MOTION_PAGE_US;
        show_page(GW_UI_PAGE_CAMERA);
    } else if (s_page_return_at_us != 0) {
        s_page_return_at_us = esp_timer_get_time() + MOTION_PAGE_US;   /* còn chuyển động: gia hạn */
    }
}

static void handle_telemetry(const app_event_t *ev)
{
    const gw_device_info_t *dev = gw_registry_get(ev->tel.idx);
    gw_ui_set_telemetry(dev->device_id, ev->tel.payload, ev->tel.len);

    char *json = gw_envelope_telemetry(ev->tel.payload, ev->tel.len);
    if (json == NULL) {
        ESP_LOGW(TAG, "telemetry from %s: cannot build payload", dev->device_id);
        return;
    }
    if (gw_mqtt_publish_telemetry(json) == ESP_OK) {
        free(json);
        return;
    }
    if (s_api_ok) {
        uplink_job_t job = {.type = UP_TELEMETRY, .json = json};
        if (xQueueSend(s_up_q, &job, 0) == pdTRUE) {
            return;   /* task uplink giải phóng json */
        }
    }
    free(json);
    /* TODO: đệm thẻ TF khi mất Internet (IOT_NODE_NETWORK §7, §10 Q3) */
    ESP_LOGW(TAG, "telemetry from %s dropped: no route to server", dev->device_id);
}

static void handle_node_event(const app_event_t *ev)
{
    const gw_device_info_t *dev = gw_registry_get(ev->nev.idx);
    if (dev->kind == GW_DEV_CAMERA && strcmp(ev->nev.event, "motion") == 0) {
        s_motion[ev->nev.idx] = (motion_t){.active = true, .ts = ev->nev.ts, .since_us = esp_timer_get_time()};
        motion_show_camera();
        return;
    }
    ESP_LOGI(TAG, "event %s from %s — not forwarded yet", ev->nev.event, dev->device_id);
}

static void handle_cmd_ack(const app_event_t *ev)
{
    const gw_device_info_t *dev = gw_registry_get(ev->ack.idx);
    for (size_t i = 0; i < PENDING_MAX; i++) {
        pending_t *p = &s_pending[i];
        /* Khớp cả command_id lẫn thiết bị: node khác không ack thay được. */
        if (p->used && p->idx == ev->ack.idx && strcmp(p->command_id, ev->ack.command_id) == 0) {
            publish_ack(p->home, p->device_id, p->command_id, ev->ack.ok, ev->ack.power);
            p->used = false;
            return;
        }
    }
    ESP_LOGW(TAG, "CMD_ACK %s from %s: no pending command (late or unknown)", ev->ack.command_id, dev->device_id);
}

static void handle_snapshot(const app_event_t *ev)
{
    gw_snapshot_t snap = ev->snap;
    const gw_device_info_t *dev = gw_registry_get(snap.camera_idx);

    bool with_event = snap.trigger == GW_SNAP_MOTION;
    int64_t event_ts = snap.ts;
    motion_t *m = &s_motion[snap.camera_idx];
    if (with_event && m->active) {
        event_ts = m->ts;   /* ghép ảnh với sự kiện EVENT motion đã nhận */
        m->active = false;
    }
    if (s_api_ok) {
        uplink_job_t job = {.type = UP_SNAPSHOT, .snap = snap, .with_event = with_event, .event_ts = event_ts};
        strlcpy(job.home, s_home_id, sizeof(job.home));
        if (xQueueSend(s_up_q, &job, 0) == pdTRUE) {
            return;   /* task uplink giải phóng ảnh */
        }
        ESP_LOGW(TAG, "uplink busy — snapshot from %s not uploaded", dev->device_id);
    }
    free(snap.jpeg);
    if (with_event) {
        publish_camera_event(s_home_id, dev->device_id, event_ts, NULL);
    }
}

/*
 * Thiết bị nhận lệnh: UID của node/camera đã ghép nối, hoặc "<node_id>-<thiết bị con>" — thiết bị node điều khiển
 * (Server tạo các dòng này: register-hardware.ts, applianceUid). Thiết bị con chỉ thuộc node, không thuộc camera.
 */
static int find_cmd_target(const char *device_id, const char **target)
{
    *target = NULL;
    int idx = gw_registry_find_id(device_id);
    if (idx >= 0) {
        return idx;
    }
    static const char *const subs[] = {"lamp", "fan", "curtain", "ac"};
    const char *dash = strrchr(device_id, '-');
    if (dash == NULL || dash == device_id) {
        return -1;
    }
    for (size_t i = 0; i < sizeof(subs) / sizeof(subs[0]); i++) {
        if (strcmp(dash + 1, subs[i]) != 0) {
            continue;
        }
        char base[ID_MAX + 1];
        size_t len = (size_t)(dash - device_id);
        if (len >= sizeof(base)) {
            return -1;
        }
        memcpy(base, device_id, len);
        base[len] = '\0';
        idx = gw_registry_find_id(base);
        if (idx < 0 || gw_registry_get((size_t)idx)->kind != GW_DEV_NODE) {
            return -1;
        }
        *target = subs[i];
        return idx;
    }
    return -1;
}

/* live_start: mở (hoặc thay) phiên relay lên Server cho camera idx; live_stop: đóng nếu đúng phiên. Không log session_id. */
static void handle_live_command(int idx, const char *session_id, bool start)
{
    if (start) {
        const gw_device_info_t *dev = gw_registry_get((size_t)idx);
        if (!s_api_ok || gw_camera_relay_start(dev->device_id, session_id) != ESP_OK) {
            ESP_LOGW(TAG, "remote view of %s cannot start (server URL / relay not ready)", dev->device_id);
            return;
        }
        ESP_LOGI(TAG, "remote view requested for %s", dev->device_id);
        atomic_store(&s_relay_cam, idx);
    } else if (gw_camera_relay_stop(session_id)) {
        ESP_LOGI(TAG, "remote view stopped by server");
    } else {
        return;   /* không phải phiên đang chạy (lệnh muộn / cũ) */
    }
    live_sync();
}

static void handle_device_cmd(const app_event_t *ev)
{
    const char *home = ev->dcmd.home;
    const char *dev_id = ev->dcmd.device_id;
    const char *cmd = ev->dcmd.command_id;
    const char *action = ev->dcmd.action;
    learn_home(home);
    /* live_*: command_id = session_id của phiên xem từ xa → log chỉ action, không log id. */
    const char *lid = strncmp(action, "live_", 5) == 0 ? action : cmd;

    const char *target = NULL;
    int idx = find_cmd_target(dev_id, &target);
    if (idx < 0) {
        ESP_LOGW(TAG, "command %s: device %s is not paired with this gateway", lid, dev_id);
        publish_ack(home, dev_id, cmd, false, -1);
        return;
    }
    if (gw_registry_get((size_t)idx)->kind == GW_DEV_CAMERA) {
        if (strcmp(action, "live_start") == 0 || strcmp(action, "live_stop") == 0) {
            /* Điều khiển PHIÊN XEM TỪ XA (IOT_NODE_NETWORK §5.5), không phải lệnh người dùng: command_id chính là
             * session_id, KHÔNG ack (Server không chờ). HMAC + ts + chống phát lại đã kiểm ở gw_mqtt. */
            handle_live_command(idx, cmd, strcmp(action, "live_start") == 0);
            return;
        }
        if (strcmp(action, "snapshot") != 0) {
            ESP_LOGW(TAG, "command %s: camera action %s not supported", lid, action);
            publish_ack(home, dev_id, cmd, false, -1);
            return;
        }
    }
    pending_t *slot = NULL;
    for (size_t i = 0; i < PENDING_MAX && slot == NULL; i++) {
        if (!s_pending[i].used) {
            slot = &s_pending[i];
        }
    }
    int64_t now;
    if (slot == NULL || !gw_time_now(&now)) {
        ESP_LOGW(TAG, "command %s: gateway busy", lid);
        publish_ack(home, dev_id, cmd, false, -1);
        return;
    }
    if (gw_espnow_send_cmd((size_t)idx, cmd, action, target, now) != ESP_OK) {
        ESP_LOGW(TAG, "command %s: %s unreachable over ESP-NOW", lid, dev_id);
        publish_ack(home, dev_id, cmd, false, -1);
        return;
    }
    const int64_t wait_us = strncmp(action, "learn_", 6) == 0 ? LEARN_ACK_TIMEOUT_US : ACK_TIMEOUT_US;
    *slot = (pending_t){.used = true, .idx = (size_t)idx, .deadline_us = esp_timer_get_time() + wait_us};
    strlcpy(slot->command_id, cmd, sizeof(slot->command_id));
    strlcpy(slot->home, home, sizeof(slot->home));
    strlcpy(slot->device_id, dev_id, sizeof(slot->device_id));   /* ack về đúng UID Server đã gửi (kể cả "-ac") */
    ESP_LOGI(TAG, "command %s → %s (%s), waiting CMD_ACK", lid, dev_id, action);
}

static void handle_gateway_cmd(const app_event_t *ev)
{
    learn_home(ev->gcmd.home);
    if (strcmp(ev->gcmd.action, "restart") == 0) {
        ESP_LOGW(TAG, "restart requested by server (command %s)", ev->gcmd.command_id);
        gw_ui_set_status("Khởi động lại theo lệnh từ máy chủ...", false);
        gw_registry_save_seen(true);       /* giữ đúng "lần cuối kết nối" qua lần khởi động lại */
        vTaskDelay(pdMS_TO_TICKS(1000));   /* cho MQTT/log kịp gửi */
        esp_restart();
    } else if (strcmp(ev->gcmd.action, "factory_reset") == 0) {
        /* Xoá NVS là không đảo ngược được — cần xác nhận 2 bước trên màn hình (IOT_NODE_NETWORK §3.3). */
        ESP_LOGW(TAG, "factory_reset (command %s) not supported yet", ev->gcmd.command_id);
    } else {
        ESP_LOGW(TAG, "unknown gateway action %s", ev->gcmd.action);
    }
}

/* ---- việc định kỳ ------------------------------------------------------------------------------------- */

static void refresh_network_ui(void)
{
    char ip[16] = "";
    bool wifi = gw_wifi_sta_ip(ip, sizeof(ip));
    gw_ui_set_network(wifi, ip, gw_mqtt_connected(), gw_time_is_synced());
}

/*
 * Kết nối thiết bị ↔ Gateway cho bảng Thiết bị (chấm xanh / vàng / đỏ):
 *   Đã kết nối    có gói ESP-NOW hợp lệ trong CONFIG_GW_NODE_OFFLINE_S; camera còn phải đang ở Local AP (đường hình)
 *   Đang kết nối  camera mới có 1 trong 2 đường (đã vào Local AP nhưng chưa có ESP-NOW, hoặc ngược lại), hoặc Gateway
 *                 khởi động chưa tới LINK_BOOT_GRACE_US mà thiết bị chưa kịp gửi gói (node đang dò kênh, camera đang
 *                 vào lại Local AP)
 *   Chưa kết nối  còn lại — chưa từng thấy, hoặc quá CONFIG_GW_NODE_OFFLINE_S không có gói
 */
static gw_ui_link_t device_link(const gw_device_info_t *d, const gw_device_status_t *st, int64_t now_us)
{
    bool on_ap = false;
    if (d->kind == GW_DEV_CAMERA) {
        esp_ip4_addr_t ip;
        on_ap = gw_wifi_ap_client_ip(d->mac, &ip);
    }
    const bool camera = d->kind == GW_DEV_CAMERA;
    if (st->online && (!camera || on_ap)) {
        return GW_UI_LINK_OK;
    }
    if ((camera && (on_ap || st->online)) || (st->last_seen_us == 0 && now_us < LINK_BOOT_GRACE_US)) {
        return GW_UI_LINK_CONNECTING;
    }
    return GW_UI_LINK_NONE;
}

static void refresh_devices_ui(void)
{
    static gw_ui_device_t list[GW_UI_MAX_DEVICES];
    size_t n = gw_registry_count();
    if (n > GW_UI_MAX_DEVICES) {
        n = GW_UI_MAX_DEVICES;
    }
    int64_t now_us = esp_timer_get_time();
    for (size_t i = 0; i < n; i++) {
        const gw_device_info_t *d = gw_registry_get(i);
        gw_device_status_t st;
        gw_registry_status(i, &st);
        list[i] = (gw_ui_device_t){
            .is_camera = d->kind == GW_DEV_CAMERA,
            .link = device_link(d, &st, now_us),
            .has_rssi = st.last_seen_us != 0,
            .rssi = st.rssi,
            .last_seen_ts = st.last_seen_unix,
        };
        strlcpy(list[i].device_id, d->device_id, sizeof(list[i].device_id));
    }
    gw_ui_set_devices(list, n);
}

static void send_heartbeat(void)
{
    if (s_home_id[0] == '\0' || !gw_mqtt_connected()) {
        return;
    }
    static gw_device_status_t st[GW_REGISTRY_MAX];
    static gw_envelope_node_t nodes[GW_REGISTRY_MAX];
    int64_t now;
    if (!gw_time_now(&now)) {
        return;
    }
    int64_t now_us = esp_timer_get_time();
    size_t n = gw_registry_count();
    for (size_t i = 0; i < n; i++) {
        gw_registry_status(i, &st[i]);
        nodes[i] = (gw_envelope_node_t){
            .device_id = gw_registry_get(i)->device_id,
            .rssi = st[i].rssi,
            .last_seen = st[i].last_seen_us ? now - (now_us - st[i].last_seen_us) / 1000000 : 0,
            .fw_version = st[i].fw_version,
            .online = st[i].online,
        };
    }
    char *json = gw_envelope_heartbeat((uint32_t)(now_us / 1000000), nodes, n);
    if (json != NULL) {
        gw_mqtt_publish_heartbeat(s_home_id, json);
        free(json);
    }
}

static void tick(void)
{
    static int64_t last_net, last_dev, last_hb, last_seen_save;
    int64_t now_us = esp_timer_get_time();

    for (size_t i = 0; i < PENDING_MAX; i++) {
        pending_t *p = &s_pending[i];
        if (p->used && now_us >= p->deadline_us) {
            const gw_device_info_t *dev = gw_registry_get(p->idx);
            ESP_LOGW(TAG, "command %s: no CMD_ACK from %s within the ack timeout", p->command_id, dev->device_id);
            publish_ack(p->home, p->device_id, p->command_id, false, -1);
            p->used = false;
        }
    }
    for (size_t i = 0; i < gw_registry_count() && i < GW_REGISTRY_MAX; i++) {
        motion_t *m = &s_motion[i];
        if (m->active && now_us - m->since_us >= MOTION_WAIT_US) {
            m->active = false;   /* camera không gửi kịp ảnh → báo sự kiện không kèm ảnh */
            publish_camera_event(s_home_id, gw_registry_get(i)->device_id, m->ts, NULL);
        }
    }
    if (s_page_return_at_us != 0 && now_us >= s_page_return_at_us) {
        s_page_return_at_us = 0;
        show_page(s_page_before_motion);   /* hết chuyển động, không ai chạm màn hình → về trang cũ */
    }
    if (now_us - last_net >= NET_REFRESH_US) {
        last_net = now_us;
        refresh_network_ui();
        live_sync();   /* camera vừa vào Local AP / tới lượt thử lại */
    }
    if (now_us - last_dev >= DEVICES_REFRESH_US) {
        last_dev = now_us;
        refresh_devices_ui();
    }
    if (now_us - last_hb >= HEARTBEAT_US) {
        last_hb = now_us;
        send_heartbeat();
    }
    if (now_us - last_seen_save >= SEEN_SAVE_CHECK_US) {
        last_seen_save = now_us;
        gw_registry_save_seen(false);   /* tự giới hạn số lần ghi NVS (gw_registry.h) */
    }
}

static void app_task(void *arg)
{
    app_event_t ev;
    for (;;) {
        if (xQueueReceive(s_app_q, &ev, pdMS_TO_TICKS(APP_TICK_MS)) == pdTRUE) {
            switch (ev.type) {
            case EV_TELEMETRY:
                handle_telemetry(&ev);
                break;
            case EV_NODE_EVENT:
                handle_node_event(&ev);
                break;
            case EV_CMD_ACK:
                handle_cmd_ack(&ev);
                break;
            case EV_SNAPSHOT:
                handle_snapshot(&ev);
                break;
            case EV_DEVICE_CMD:
                handle_device_cmd(&ev);
                break;
            case EV_GATEWAY_CMD:
                handle_gateway_cmd(&ev);
                break;
            case EV_PAGE:
                handle_page(&ev);
                break;
            case EV_LIVE_STATE:
                handle_live_state(&ev);
                break;
            case EV_RELAY_ENDED:
                live_sync();   /* phiên xem từ xa đã hết: ngừng kéo luồng nếu LCD cũng không xem */
                break;
            }
        }
        tick();
    }
}

/* ==== task gw_uplink: HTTPS (chặn) ======================================================================== */

static void uplink_task(void *arg)
{
    uplink_job_t job;
    for (;;) {
        if (xQueueReceive(s_up_q, &job, portMAX_DELAY) != pdTRUE) {
            continue;
        }
        if (job.type == UP_TELEMETRY) {
            if (gw_api_post_telemetry(job.json) == ESP_OK) {
                ESP_LOGI(TAG, "telemetry sent via HTTP fallback");
            }
            free(job.json);
            continue;
        }
        const gw_device_info_t *dev = gw_registry_get(job.snap.camera_idx);
        char sid[GW_SNAPSHOT_ID_MAX + 1] = "";
        esp_err_t err = gw_api_post_snapshot(dev->device_id, job.snap.trigger == GW_SNAP_MOTION ? "motion" : "request",
                                             job.snap.command_id, job.snap.jpeg, job.snap.len, sid);
        free(job.snap.jpeg);
        ESP_LOGI(TAG, "snapshot from %s %s server", dev->device_id, err == ESP_OK ? "uploaded to" : "not accepted by");
        if (job.with_event) {
            publish_camera_event(job.home, dev->device_id, job.event_ts, err == ESP_OK ? sid : NULL);
        }
    }
}

/* ==== khởi động ========================================================================================== */

static void on_wifi_state(bool sta_connected, void *ctx)
{
    /* Màn hình cập nhật theo chu kỳ trong tick(); SNTP và MQTT tự kết nối lại. */
}

static esp_err_t fail(const char *ui_text, esp_err_t err)
{
    gw_ui_set_status(ui_text, true);
    return err;
}

esp_err_t gw_app_start(void)
{
    setenv("TZ", LOCAL_TZ, 1);
    tzset();

    /* NVS: KHÔNG tự xoá khi lỗi (sẽ mất identity + danh sách node) — báo để nạp lại ảnh NVS. */
    esp_err_t nvs_err = nvs_flash_init();

    /* Màn hình trước để hiện được lỗi cấu hình. Code Waveshare abort nếu phần cứng LCD lỗi. */
    if (gw_display_init() == ESP_OK) {
        gw_ui_start();
    }
    gw_time_rtc_t rtc = {.read = gw_rtc_read, .write = gw_rtc_write};
    gw_time_init(gw_rtc_init() == ESP_OK ? &rtc : NULL);

    if (nvs_err != ESP_OK) {
        ESP_LOGE(TAG, "nvs_flash_init: %s — re-flash the NVS image (README: Nap NVS)", esp_err_to_name(nvs_err));
        return fail("Lỗi bộ nhớ NVS: nạp lại ảnh NVS (xem README)", nvs_err);
    }
    esp_err_t err = gw_config_load(&s_cfg);
    if (err != ESP_OK) {
        return fail("Gateway chưa được cấp phát: nạp NVS identity/device_uuid + device_secret (README)", err);
    }
    strlcpy(s_home_id, s_cfg.home_id, sizeof(s_home_id));
    gw_registry_load(s_cfg.device_id);

    ESP_ERROR_CHECK(esp_netif_init());
    ESP_ERROR_CHECK(esp_event_loop_create_default());
    err = gw_wifi_start(&s_cfg, on_wifi_state, NULL);
    gw_config_wipe_passwords(&s_cfg);   /* driver WiFi đã giữ bản của nó */
    if (err != ESP_OK) {
        return fail("Không khởi động được WiFi - kiểm tra log", err);
    }
    gw_time_start_sntp(CONFIG_GW_SNTP_SERVER);

    /* Hàng đợi + task trước, rồi mới bật các nguồn sự kiện. */
    s_app_q = xQueueCreate(APP_QUEUE_LEN, sizeof(app_event_t));
    s_up_q = xQueueCreate(UPLINK_QUEUE_LEN, sizeof(uplink_job_t));
    if (s_app_q == NULL || s_up_q == NULL ||
        xTaskCreatePinnedToCore(app_task, "gw_app", APP_TASK_STACK, NULL, 4, NULL, 0) != pdPASS ||
        xTaskCreatePinnedToCore(uplink_task, "gw_uplink", UPLINK_TASK_STACK, NULL, 1, NULL, 1) != pdPASS) {
        return fail("Thiếu bộ nhớ khi khởi động", ESP_ERR_NO_MEM);
    }

    const gw_espnow_callbacks_t ecb = {
        .on_telemetry = on_telemetry,
        .on_event = on_node_event,
        .on_cmd_ack = on_cmd_ack,
    };
    if (gw_espnow_start(&ecb) != ESP_OK) {
        gw_ui_set_status("Không khởi động được ESP-NOW - kiểm tra log", true);
    }
    if (gw_local_http_start(on_snapshot, NULL) != ESP_OK) {
        gw_ui_set_status("Không mở được cổng nhận ảnh camera - kiểm tra log", true);
    }
    const gw_camera_live_callbacks_t lcb = {.on_frame = on_live_frame, .on_state = on_live_state};
    if (gw_camera_live_init(&lcb) != ESP_OK) {
        gw_ui_set_status("Thiếu bộ nhớ cho luồng camera - kiểm tra log", true);
    }
    if (gw_camera_relay_init(on_relay_ended, NULL) != ESP_OK) {
        ESP_LOGW(TAG, "remote camera view disabled: relay not started (low PSRAM?)");   /* LCD vẫn xem được */
    }
    gw_ui_set_page_handler(on_ui_page, NULL);
    gw_ui_show_page(s_page);   /* trang khởi động (menuconfig); luồng camera bật ở live_sync trong tick() */

    s_api_ok = gw_api_init(s_cfg.api_url) == ESP_OK;
    bool mqtt_ok = false;
    if (s_cfg.has_wifi) {
        const gw_mqtt_callbacks_t mcb = {
            .on_device_cmd = on_device_cmd,
            .on_gateway_cmd = on_gateway_cmd,
            .on_ota_cmd = on_ota_cmd,
            .on_connection = on_mqtt_connection,
        };
        mqtt_ok = gw_mqtt_start(s_cfg.mqtt_uri, &mcb) == ESP_OK;
    }

    /* Khởi tạo xong → xác nhận bản firmware này để bootloader không rollback. */
    esp_ota_mark_app_valid_cancel_rollback();

    if (!s_cfg.has_wifi) {
        snprintf(s_ready_status, sizeof(s_ready_status),
                 "Chưa có WiFi router (NVS wifi/ssid): chỉ chạy Local AP, %u thiết bị", (unsigned)gw_registry_count());
        s_ready_status_error = true;
    } else if (!mqtt_ok) {
        strlcpy(s_ready_status, "Không kết nối được máy chủ: thiếu certs/mqtt_ca.crt hoặc sai cloud/mqtt_uri",
                sizeof(s_ready_status));
        s_ready_status_error = true;
    } else {
        snprintf(s_ready_status, sizeof(s_ready_status), "Sẵn sàng - %u thiết bị đã ghép",
                 (unsigned)gw_registry_count());
        s_ready_status_error = false;
    }
    gw_ui_set_status(s_ready_status, s_ready_status_error);
    ESP_LOGI(TAG, "gateway started");
    return ESP_OK;
}
