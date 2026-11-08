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
#define HEARTBEAT_US ((int64_t)CONFIG_GW_HEARTBEAT_INTERVAL_S * 1000 * 1000)
#define ACK_TIMEOUT_US ((int64_t)CONFIG_GW_NODE_ACK_TIMEOUT_MS * 1000)
#define MOTION_WAIT_US ((int64_t)CONFIG_GW_MOTION_SNAPSHOT_WAIT_S * 1000 * 1000)
#define LOCAL_TZ "<+07>-7"        /* giờ Việt Nam cho màn hình; giờ hệ thống và HMAC vẫn là UTC */
#define LIVE_MANUAL_S 120         /* mở bằng nút: tự đóng sau 2 phút (màn hình chưa có hẹn giờ tắt — §3.3) */
#define LIVE_FOREVER_S UINT32_MAX /* "không tự đóng" */
#define LIVE_FOREVER_US INT64_MAX
#define LIVE_REOPEN_MIN_US (5 * 1000 * 1000LL)    /* chế độ luôn hiện: hỏng thì thử mở lại sau 5 s, */
#define LIVE_REOPEN_MAX_US (60 * 1000 * 1000LL)   /* hỏng liên tiếp thì lùi dần tới 60 s */
#define STATUS_MAX 96

#if CONFIG_GW_CAMERA_LIVE_ALWAYS
#define LIVE_ALWAYS 1
#else
#define LIVE_ALWAYS 0
#endif

/* ---- sự kiện từ các task khác → task gw_app ----------------------------------------------------------- */

typedef enum {
    EV_TELEMETRY,
    EV_NODE_EVENT,
    EV_CMD_ACK,
    EV_SNAPSHOT,
    EV_DEVICE_CMD,
    EV_GATEWAY_CMD,
    EV_LIVE_UI,      /* chạm nút xem trực tiếp / đóng */
    EV_LIVE_STATE,   /* gw_camera_live đổi trạng thái */
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
            bool open;
        } lui;
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

/* Xem trực tiếp (chỉ task gw_app): camera đang xem, hạn đóng, trạng thái đang hiện. */
static int s_live_idx = -1;
static int64_t s_live_until_us;              /* LIVE_FOREVER_US = không tự đóng */
static uint32_t s_live_seconds;              /* thời gian xin mở — tính lại từ khung đầu tiên */
static bool s_live_counting;                 /* đã lên hình ở lần mở này (bắt đầu đếm) */
static gw_ui_live_state_t s_live_ui = GW_UI_LIVE_OFF;
static bool s_live_boot_done;
static int64_t s_live_reopen_at_us;          /* chế độ luôn hiện: chưa mở lại trước thời điểm này */
static int s_live_failures;                  /* chế độ luôn hiện: số lần hỏng liên tiếp */
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

/* Task gw_live: giải nén ngay tại đây (không qua hàng đợi) — camera tự bỏ khung cũ khi Gateway đọc chậm. */
static void on_live_frame(size_t idx, const uint8_t *jpeg, size_t len, void *ctx)
{
    gw_ui_live_frame(jpeg, len);
}

static void on_live_state(size_t idx, gw_live_state_t state, gw_live_err_t err, int http_status, void *ctx)
{
    app_event_t ev = {.type = EV_LIVE_STATE, .lst = {.idx = idx, .state = state, .err = err, .http_status = http_status}};
    post(&ev, "live state");
}

/* Task LVGL (đang giữ khoá LVGL) — chỉ đẩy vào hàng đợi. */
static void on_ui_live(bool open, void *ctx)
{
    app_event_t ev = {.type = EV_LIVE_UI, .lui = {.open = open}};
    post(&ev, "live request");
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

/* Chế độ luôn hiện (CONFIG_GW_CAMERA_LIVE_ALWAYS): mọi cách mở đều không tự đóng. */
static uint32_t live_seconds(uint32_t seconds)
{
    return LIVE_ALWAYS ? LIVE_FOREVER_S : seconds;
}

static int64_t live_deadline(uint32_t seconds)
{
    return seconds == LIVE_FOREVER_S ? LIVE_FOREVER_US : esp_timer_get_time() + (int64_t)seconds * 1000000;
}

static void live_ui_update(void)
{
    if (s_live_idx < 0) {
        gw_ui_set_live(GW_UI_LIVE_OFF, NULL, 0);
        return;
    }
    uint32_t close_in = 0;   /* 0 = không hiện đếm ngược */
    if (s_live_until_us != LIVE_FOREVER_US) {
        int64_t left_us = s_live_until_us - esp_timer_get_time();
        close_in = left_us > 0 ? (uint32_t)((left_us + 999999) / 1000000) : 0;
    }
    gw_ui_set_live(s_live_ui, gw_registry_get((size_t)s_live_idx)->device_id, close_in);
}

/*
 * Mở (hoặc gia hạn) xem trực tiếp camera idx trong `seconds` giây (LIVE_FOREVER_S = không tự đóng). Thời gian được
 * tính lại từ lúc lên hình (handle_live_state), nên mấy giây kết nối không ăn vào thời gian xem.
 */
static void live_open(int idx, uint32_t seconds, const char *why)
{
    if (idx < 0 || seconds == 0) {
        return;
    }
    const gw_device_info_t *dev = gw_registry_get((size_t)idx);
    const int64_t until = live_deadline(seconds);
    if (s_live_idx == idx) {
        if (until > s_live_until_us) {
            s_live_until_us = until;   /* đang xem: chỉ gia hạn, không mở lại kết nối */
        }
        if (seconds > s_live_seconds) {
            s_live_seconds = seconds;
        }
        live_ui_update();
        return;
    }
    if (gw_camera_live_start((size_t)idx) != ESP_OK) {
        ESP_LOGW(TAG, "live view of %s unavailable", dev->device_id);
        return;
    }
    s_live_idx = idx;
    s_live_until_us = until;
    s_live_seconds = seconds;
    s_live_counting = false;
    s_live_ui = GW_UI_LIVE_CONNECTING;
    if (seconds == LIVE_FOREVER_S) {
        ESP_LOGI(TAG, "live view %s, no time limit (%s)", dev->device_id, why);
    } else {
        ESP_LOGI(TAG, "live view %s for %u s (%s)", dev->device_id, (unsigned)seconds, why);
    }
    live_ui_update();
}

static void live_close(const char *why)
{
    if (s_live_idx < 0) {
        return;
    }
    ESP_LOGI(TAG, "live view closed (%s)", why);
    gw_camera_live_stop();
    s_live_idx = -1;
    live_ui_update();
}

/* Hướng dẫn trên dòng trạng thái khi không mở được luồng (bất biến 10: không hiện mã thô). */
static void live_show_failure(gw_live_err_t err, int http_status)
{
    char msg[STATUS_MAX];
    switch (err) {
    case GW_LIVE_ERR_NOT_ON_AP:
        strlcpy(msg, "Camera chua vao Local AP: kiem tra nguon va wifi/ssid, password cua camera", sizeof(msg));
        break;
    case GW_LIVE_ERR_NO_TIME:
        strlcpy(msg, "Gateway chua co gio (NTP/RTC) nen chua mo duoc luong camera", sizeof(msg));
        break;
    case GW_LIVE_ERR_AUTH:
        strlcpy(msg, "Camera tu choi chu ky: secret camera trong NVS Gateway (nodes) khong khop", sizeof(msg));
        break;
    case GW_LIVE_ERR_BUSY:
        strlcpy(msg, "Camera dang phat cho ket noi khac - thu lai sau it giay", sizeof(msg));
        break;
    case GW_LIVE_ERR_CAM_NO_TIME:
        strlcpy(msg, "Camera chua co gio: kiem tra ghep noi ESP-NOW (gateway_mac, LMK)", sizeof(msg));
        break;
    case GW_LIVE_ERR_HTTP:
        snprintf(msg, sizeof(msg), "Camera tra loi HTTP %d khi mo luong truc tiep", http_status);
        break;
    default:
        strlcpy(msg, "Mat ket noi camera - kiem tra nguon va song WiFi cua camera", sizeof(msg));
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
        s_live_ui = GW_UI_LIVE_CONNECTING;
        break;
    case GW_LIVE_STREAMING:
        s_live_ui = GW_UI_LIVE_PLAYING;
        s_live_failures = 0;
        if (!s_live_counting) {
            /* Khung đầu tiên của lần mở này: đếm thời gian xem từ đây, không tính lúc kết nối. */
            s_live_counting = true;
            const int64_t from_first_frame = live_deadline(s_live_seconds);
            if (from_first_frame > s_live_until_us) {
                s_live_until_us = from_first_frame;
            }
        }
        if (s_status_by_live) {
            gw_ui_set_status(s_ready_status, s_ready_status_error);
            s_status_by_live = false;
        }
        break;
    case GW_LIVE_RETRYING:
        s_live_ui = GW_UI_LIVE_RETRY;
        break;
    case GW_LIVE_FAILED: {
        live_show_failure(ev->lst.err, ev->lst.http_status);
        s_live_idx = -1;   /* service đã tự dừng */
        /* Luôn hiện: thử mở lại sau 5, 10, 20… tối đa 60 s (không nháy màn hình liên tục khi lỗi cấu hình). */
        int64_t wait_us = LIVE_REOPEN_MIN_US << (s_live_failures < 4 ? s_live_failures : 4);
        if (wait_us > LIVE_REOPEN_MAX_US) {
            wait_us = LIVE_REOPEN_MAX_US;
        }
        s_live_failures++;
        s_live_reopen_at_us = esp_timer_get_time() + wait_us;
        break;
    }
    case GW_LIVE_STOPPED:
        return;   /* do chính gw_app dừng — đã cập nhật màn hình */
    }
    live_ui_update();
}

static void handle_live_ui(const app_event_t *ev)
{
    if (!ev->lui.open) {
        live_close("closed on screen");
        if (LIVE_ALWAYS) {
            /* Người dùng chủ động đóng: chế độ luôn hiện chờ LIVE_MANUAL_S rồi mới tự mở lại. */
            s_live_reopen_at_us = esp_timer_get_time() + (int64_t)LIVE_MANUAL_S * 1000000;
        }
        return;
    }
    int cam = first_camera();
    if (cam < 0) {
        gw_ui_set_status("Chua ghep camera nao: them nodes/<i>_kind = camera vao NVS (README)", true);
        return;
    }
    live_open(cam, live_seconds(LIVE_MANUAL_S), "opened on screen");
}

/* Camera đã vào Local AP và Gateway ký được yêu cầu (có giờ) → mở luồng mới có nghĩa. */
static int camera_reachable(void)
{
    int cam = first_camera();
    esp_ip4_addr_t ip;
    if (cam < 0 || !gw_time_is_synced() || !gw_wifi_ap_client_ip(gw_registry_get((size_t)cam)->mac, &ip)) {
        return -1;
    }
    return cam;
}

/* 1 lần sau khởi động: camera vừa vào Local AP → mở xem thử để thấy ngay đường hình (Kconfig). */
static void live_boot_check(void)
{
    if (s_live_boot_done) {
        return;
    }
    if (LIVE_ALWAYS || CONFIG_GW_CAMERA_LIVE_ON_BOOT_S == 0 || first_camera() < 0) {
        s_live_boot_done = true;   /* chế độ luôn hiện đã lo việc này */
        return;
    }
    int cam = camera_reachable();
    if (cam < 0) {
        return;   /* chưa ký được / camera chưa vào Local AP — thử lại ở lần sau */
    }
    s_live_boot_done = true;
    live_open(cam, CONFIG_GW_CAMERA_LIVE_ON_BOOT_S, "camera joined local AP");
}

/* Chế độ luôn hiện: camera trực tuyến là mở; luồng hỏng hẳn thì thử lại theo s_live_reopen_at_us. */
static void live_always_check(void)
{
    if (!LIVE_ALWAYS || s_live_idx >= 0 || esp_timer_get_time() < s_live_reopen_at_us) {
        return;
    }
    int cam = camera_reachable();
    if (cam >= 0) {
        live_open(cam, LIVE_FOREVER_S, "always on");
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
        gw_ui_set_motion(dev->device_id, ev->nev.ts);
        if (CONFIG_GW_CAMERA_LIVE_ON_MOTION_S > 0) {
            live_open((int)ev->nev.idx, live_seconds(CONFIG_GW_CAMERA_LIVE_ON_MOTION_S), "motion");
        }
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
            publish_ack(p->home, dev->device_id, p->command_id, ev->ack.ok, ev->ack.power);
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
    gw_ui_set_snapshot(dev->device_id, snap.len, snap.ts, false);
    gw_ui_set_snapshot_image(snap.jpeg, snap.len);   /* giải nén thu nhỏ ở đây, trước khi giao ảnh cho uplink */

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

static void handle_device_cmd(const app_event_t *ev)
{
    const char *home = ev->dcmd.home;
    const char *dev_id = ev->dcmd.device_id;
    const char *cmd = ev->dcmd.command_id;
    const char *action = ev->dcmd.action;
    learn_home(home);

    int idx = gw_registry_find_id(dev_id);
    if (idx < 0) {
        ESP_LOGW(TAG, "command %s: device %s is not paired with this gateway", cmd, dev_id);
        publish_ack(home, dev_id, cmd, false, -1);
        return;
    }
    if (gw_registry_get((size_t)idx)->kind == GW_DEV_CAMERA && strcmp(action, "snapshot") != 0) {
        /* live_start / live_stop từ Server = xem từ xa trên Mobile (IOT_NODE_NETWORK §5.5): cần chuyển tiếp khung
         * lên Backend — chưa làm. Xem trên màn hình Gateway thì gw_camera_live đã kéo GET /stream (§5.4). */
        ESP_LOGW(TAG, "command %s: camera action %s not supported yet", cmd, action);
        publish_ack(home, dev_id, cmd, false, -1);
        return;
    }
    pending_t *slot = NULL;
    for (size_t i = 0; i < PENDING_MAX && slot == NULL; i++) {
        if (!s_pending[i].used) {
            slot = &s_pending[i];
        }
    }
    int64_t now;
    if (slot == NULL || !gw_time_now(&now)) {
        ESP_LOGW(TAG, "command %s: gateway busy", cmd);
        publish_ack(home, dev_id, cmd, false, -1);
        return;
    }
    if (gw_espnow_send_cmd((size_t)idx, cmd, action, now) != ESP_OK) {
        ESP_LOGW(TAG, "command %s: %s unreachable over ESP-NOW", cmd, dev_id);
        publish_ack(home, dev_id, cmd, false, -1);
        return;
    }
    *slot = (pending_t){.used = true, .idx = (size_t)idx, .deadline_us = esp_timer_get_time() + ACK_TIMEOUT_US};
    strlcpy(slot->command_id, cmd, sizeof(slot->command_id));
    strlcpy(slot->home, home, sizeof(slot->home));
    ESP_LOGI(TAG, "command %s → %s (%s), waiting CMD_ACK", cmd, dev_id, action);
}

static void handle_gateway_cmd(const app_event_t *ev)
{
    learn_home(ev->gcmd.home);
    if (strcmp(ev->gcmd.action, "restart") == 0) {
        ESP_LOGW(TAG, "restart requested by server (command %s)", ev->gcmd.command_id);
        gw_ui_set_status("Khoi dong lai theo lenh tu Server...", false);
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
            .online = st.online,
            .rssi = st.rssi,
            .seen_ago_s = st.last_seen_us ? (uint32_t)((now_us - st.last_seen_us) / 1000000) : UINT32_MAX,
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
    static int64_t last_net, last_dev, last_hb;
    int64_t now_us = esp_timer_get_time();

    for (size_t i = 0; i < PENDING_MAX; i++) {
        pending_t *p = &s_pending[i];
        if (p->used && now_us >= p->deadline_us) {
            const gw_device_info_t *dev = gw_registry_get(p->idx);
            ESP_LOGW(TAG, "command %s: no CMD_ACK from %s within %d ms", p->command_id, dev->device_id,
                     CONFIG_GW_NODE_ACK_TIMEOUT_MS);
            publish_ack(p->home, dev->device_id, p->command_id, false, -1);
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
    if (s_live_idx >= 0 && now_us >= s_live_until_us) {
        live_close("time is up");
    }
    if (now_us - last_net >= NET_REFRESH_US) {
        last_net = now_us;
        refresh_network_ui();
        live_boot_check();
        live_always_check();
        if (s_live_idx >= 0) {
            live_ui_update();   /* đếm ngược "tu dong dong sau N s" */
        }
    }
    if (now_us - last_dev >= DEVICES_REFRESH_US) {
        last_dev = now_us;
        refresh_devices_ui();
    }
    if (now_us - last_hb >= HEARTBEAT_US) {
        last_hb = now_us;
        send_heartbeat();
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
            case EV_LIVE_UI:
                handle_live_ui(&ev);
                break;
            case EV_LIVE_STATE:
                handle_live_state(&ev);
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
        gw_ui_set_snapshot(dev->device_id, job.snap.len, job.snap.ts, err == ESP_OK);
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
        return fail("Loi bo nho NVS: nap lai anh NVS (xem README)", nvs_err);
    }
    esp_err_t err = gw_config_load(&s_cfg);
    if (err != ESP_OK) {
        return fail("Gateway chua duoc cap phat: nap NVS identity/device_uuid + device_secret (README)", err);
    }
    strlcpy(s_home_id, s_cfg.home_id, sizeof(s_home_id));
    gw_registry_load(s_cfg.device_id);

    ESP_ERROR_CHECK(esp_netif_init());
    ESP_ERROR_CHECK(esp_event_loop_create_default());
    err = gw_wifi_start(&s_cfg, on_wifi_state, NULL);
    gw_config_wipe_passwords(&s_cfg);   /* driver WiFi đã giữ bản của nó */
    if (err != ESP_OK) {
        return fail("Khong khoi dong duoc WiFi - kiem tra log", err);
    }
    gw_time_start_sntp(CONFIG_GW_SNTP_SERVER);

    /* Hàng đợi + task trước, rồi mới bật các nguồn sự kiện. */
    s_app_q = xQueueCreate(APP_QUEUE_LEN, sizeof(app_event_t));
    s_up_q = xQueueCreate(UPLINK_QUEUE_LEN, sizeof(uplink_job_t));
    if (s_app_q == NULL || s_up_q == NULL ||
        xTaskCreatePinnedToCore(app_task, "gw_app", APP_TASK_STACK, NULL, 4, NULL, 0) != pdPASS ||
        xTaskCreatePinnedToCore(uplink_task, "gw_uplink", UPLINK_TASK_STACK, NULL, 1, NULL, 1) != pdPASS) {
        return fail("Thieu bo nho khi khoi dong", ESP_ERR_NO_MEM);
    }

    const gw_espnow_callbacks_t ecb = {
        .on_telemetry = on_telemetry,
        .on_event = on_node_event,
        .on_cmd_ack = on_cmd_ack,
    };
    if (gw_espnow_start(&ecb) != ESP_OK) {
        gw_ui_set_status("Khong khoi dong duoc ESP-NOW - kiem tra log", true);
    }
    if (gw_local_http_start(on_snapshot, NULL) != ESP_OK) {
        gw_ui_set_status("Khong mo duoc cong nhan anh camera - kiem tra log", true);
    }
    const gw_camera_live_callbacks_t lcb = {.on_frame = on_live_frame, .on_state = on_live_state};
    if (gw_camera_live_init(&lcb) != ESP_OK) {
        gw_ui_set_status("Thieu bo nho cho luong camera - kiem tra log", true);
    }
    gw_ui_set_live_handler(on_ui_live, NULL);
    if (!gw_display_touch_enabled()) {
        gw_ui_set_live_hint(LIVE_ALWAYS                         ? "Xem truc tiep: tu mo\nkhi camera truc tuyen"
                            : CONFIG_GW_CAMERA_LIVE_ON_MOTION_S > 0 ? "Xem truc tiep: tu mo\nkhi co chuyen dong"
                                                                    : "Bat cam ung de\nxem truc tiep");
    }

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
                 "Chua co WiFi router (NVS wifi/ssid): chi chay Local AP, %u thiet bi", (unsigned)gw_registry_count());
        s_ready_status_error = true;
    } else if (!mqtt_ok) {
        strlcpy(s_ready_status, "Khong ket noi duoc Server: thieu certs/mqtt_ca.crt hoac sai cloud/mqtt_uri",
                sizeof(s_ready_status));
        s_ready_status_error = true;
    } else {
        snprintf(s_ready_status, sizeof(s_ready_status), "San sang - %u thiet bi da ghep",
                 (unsigned)gw_registry_count());
        s_ready_status_error = false;
    }
    gw_ui_set_status(s_ready_status, s_ready_status_error);
    ESP_LOGI(TAG, "gateway started");
    return ESP_OK;
}
