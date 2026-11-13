#include "node_switches.h"

#include <stdatomic.h>
#include <stdio.h>
#include <string.h>

#include "board_loads.h"
#include "esp_log.h"
#include "esp_timer.h"
#include "freertos/FreeRTOS.h"
#include "freertos/queue.h"
#include "freertos/task.h"
#include "node_audio.h"
#include "node_link.h"
#include "node_state_store.h"
#include "node_ui.h"
#include "sdkconfig.h"

static const char *TAG = "node_switches";
static const char *CMD_TAG = "node_cmd";   /* vết lệnh: [2] thực thi (node_app.c giải thích các bước) */

#define SW_QUEUE_LEN 8
#define SW_TASK_STACK 3072
#define SW_TASK_PRIO 4
#define CMD_MAX_AGE_US (2500 * 1000)   /* Gateway chờ ack 3 s: lệnh xếp hàng lâu hơn thì bỏ, không đóng relay muộn */
#define RESTORE_GAP_MS 300             /* khôi phục từng relay cách nhau: không đóng 2 tải cùng lúc */

typedef enum { REQ_CMD, REQ_SET } req_type_t;

typedef struct {
    req_type_t type;
    node_switch_t sw;
    bool on;               /* REQ_SET: trạng thái người dùng muốn đặt trên màn hình */
    char command_id[65];   /* REQ_CMD */
    char action[33];       /* REQ_CMD */
    int64_t queued_us;     /* REQ_CMD */
} sw_req_t;

static const char *const NAMES[NODE_SWITCH_COUNT] = {"lamp", "fan"};   /* = target của lệnh = khoá NVS */
static const board_relay_t RELAYS[NODE_SWITCH_COUNT] = {BOARD_RELAY_LAMP, BOARD_RELAY_FAN};
static const node_ui_dev_t UI_DEVS[NODE_SWITCH_COUNT] = {NODE_UI_DEV_LAMP, NODE_UI_DEV_FAN};
static const char *const LABELS[NODE_SWITCH_COUNT] = {"Đèn", "Quạt"};   /* cho dòng thông báo trên màn hình */

static QueueHandle_t s_queue;
static atomic_bool s_changed;

#if CONFIG_NODE_APP_RESTORE_SWITCHES
/* Giá trị đang nằm trong NVS — khỏi ghi lặp. Chỉ task node_switches (và start, trước khi tạo task) dùng. 0xFF = chưa biết. */
static uint8_t s_saved[NODE_SWITCH_COUNT] = {0xFF, 0xFF};
#endif

static void persist(node_switch_t sw, bool on)
{
#if CONFIG_NODE_APP_RESTORE_SWITCHES
    uint8_t v = on ? 1 : 0;
    if (s_saved[sw] == v) {
        return;
    }
    if (node_state_set_u8(NAMES[sw], v) == ESP_OK) {
        s_saved[sw] = v;
    }
#else
    (void)sw;
    (void)on;
#endif
}

/* Đóng/cắt 1 relay; thành công thì cập nhật màn hình, NVS, cờ telemetry. source: "server" hoặc "screen" (cho log). */
static esp_err_t apply(node_switch_t sw, bool on, const char *source)
{
    if (board_relay_get(RELAYS[sw]) == on) {
        ESP_LOGI(CMD_TAG, "[2] %s already %s, relay untouched   [%s]", NAMES[sw], on ? "ON" : "OFF", source);
        node_ui_set_device(UI_DEVS[sw], on ? 1 : 0);
        return ESP_OK;
    }
    esp_err_t err = board_relay_set(RELAYS[sw], on);
    if (err != ESP_OK) {
        ESP_LOGW(CMD_TAG, "[2] %s -> %s REFUSED: %s   [%s]", NAMES[sw], on ? "ON" : "OFF",
                 err == ESP_ERR_INVALID_STATE ? "switching too fast (wait 0.5 s)" : esp_err_to_name(err), source);
        /* Công tắc trên màn hình đã gạt theo tay người dùng: đưa về trạng thái thật + nói lý do. */
        node_ui_set_device(UI_DEVS[sw], board_relay_get(RELAYS[sw]) ? 1 : 0);
        char msg[80];
        snprintf(msg, sizeof(msg), "%s: %s", LABELS[sw],
                 err == ESP_ERR_INVALID_STATE ? "bấm quá nhanh, chờ 0,5 giây rồi thử lại" : "relay không đổi được trạng thái");
        node_ui_set_notice(NODE_UI_MSG_WARN, msg);
        node_audio_beep(NODE_AUDIO_BEEP_ERROR);
        return err;
    }
    ESP_LOGI(CMD_TAG, "[2] %s -> %s (relay switched)   [%s]", NAMES[sw], on ? "ON" : "OFF", source);
    node_ui_set_device(UI_DEVS[sw], on ? 1 : 0);
    persist(sw, on);
    atomic_store(&s_changed, true);
    node_audio_beep(on ? NODE_AUDIO_BEEP_ON : NODE_AUDIO_BEEP_OFF);
    return ESP_OK;
}

/* Lệnh Server: turn_on, turn_off, toggle. */
static void handle_command(const sw_req_t *req)
{
    if (esp_timer_get_time() - req->queued_us > CMD_MAX_AGE_US) {
        ESP_LOGW(CMD_TAG, "[2] %s %s DROPPED: waited too long in queue   (cmd %s)", NAMES[req->sw], req->action,
                 req->command_id);
        node_link_send_cmd_ack(req->command_id, false, NODE_POWER_UNKNOWN);
        return;
    }
    bool target;
    if (strcmp(req->action, "turn_on") == 0) {
        target = true;
    } else if (strcmp(req->action, "turn_off") == 0) {
        target = false;
    } else if (strcmp(req->action, "toggle") == 0) {
        target = !board_relay_get(RELAYS[req->sw]);
    } else {
        ESP_LOGW(CMD_TAG, "[2] %s: unsupported action %s (turn_on / turn_off / toggle)   (cmd %s)", NAMES[req->sw],
                 req->action, req->command_id);
        node_link_send_cmd_ack(req->command_id, false, NODE_POWER_UNKNOWN);
        return;
    }
    bool ok = apply(req->sw, target, "remote") == ESP_OK;
    node_link_send_cmd_ack(req->command_id, ok, !ok ? NODE_POWER_UNKNOWN : target ? NODE_POWER_ON : NODE_POWER_OFF);
}

static void sw_task(void *arg)
{
    (void)arg;
    sw_req_t req;
    for (;;) {
        if (xQueueReceive(s_queue, &req, portMAX_DELAY) != pdTRUE) {
            continue;
        }
        if (req.type == REQ_CMD) {
            handle_command(&req);
        } else {
            apply(req.sw, req.on, "screen");
        }
    }
}

/* Callback màn hình (gạt công tắc / chạm ô), chạy trong task LVGL: chỉ xếp hàng, không chặn. */
static void ui_set(node_ui_dev_t dev, bool on, void *ctx)
{
    (void)ctx;
    sw_req_t req = {.type = REQ_SET, .on = on};
    if (dev == NODE_UI_DEV_LAMP) {
        req.sw = NODE_SWITCH_LAMP;
    } else if (dev == NODE_UI_DEV_FAN) {
        req.sw = NODE_SWITCH_FAN;
    } else {
        return;
    }
    if (xQueueSend(s_queue, &req, 0) != pdTRUE) {
        ESP_LOGW(TAG, "busy, touch on %s dropped", NAMES[req.sw]);
    }
}

/* Đóng lại relay theo NVS (khởi động sau mất điện). Chạy trước khi tạo task: chưa ai khác đụng relay. */
static void restore(void)
{
    for (int i = 0; i < NODE_SWITCH_COUNT; i++) {
        bool on = false;
#if CONFIG_NODE_APP_RESTORE_SWITCHES
        uint8_t v;
        esp_err_t err = node_state_get_u8(NAMES[i], &v);
        if (err == ESP_OK) {
            s_saved[i] = v ? 1 : 0;
            on = v != 0;
        } else if (err != ESP_ERR_NOT_FOUND) {
            ESP_LOGW(TAG, "cannot read saved %s state (%s): starting OFF", NAMES[i], esp_err_to_name(err));
        }
#endif
        if (on) {
            if (board_relay_set(RELAYS[i], true) == ESP_OK) {
                ESP_LOGI(TAG, "%s restored ON (state before power loss)", NAMES[i]);
                vTaskDelay(pdMS_TO_TICKS(RESTORE_GAP_MS));
            } else {
                on = false;
            }
        }
        node_ui_set_device(UI_DEVS[i], on ? 1 : 0);
    }
}

esp_err_t node_switches_start(void)
{
    if (s_queue != NULL) {
        return ESP_OK;
    }
    esp_err_t err = board_relays_init();
    if (err != ESP_OK) {
        if (err != ESP_ERR_NOT_SUPPORTED) {
            ESP_LOGE(TAG, "relays not available (%s): check GPIO in menuconfig (Node S3: relay)", esp_err_to_name(err));
        }
        return err;
    }
    restore();
    QueueHandle_t q = xQueueCreate(SW_QUEUE_LEN, sizeof(sw_req_t));
    if (q == NULL) {
        ESP_LOGE(TAG, "cannot start switches task (no memory)");
        return ESP_ERR_NO_MEM;
    }
    s_queue = q;
    if (xTaskCreate(sw_task, "switches", SW_TASK_STACK, NULL, SW_TASK_PRIO, NULL) != pdPASS) {
        /* Không để hàng đợi không ai xử lý: lệnh từ xa phải bị từ chối ngay (ack lỗi), không treo 3 s. */
        ESP_LOGE(TAG, "cannot start switches task (no memory)");
        s_queue = NULL;
        vQueueDelete(q);
        return ESP_ERR_NO_MEM;
    }
    const node_ui_switch_callbacks_t cbs = {.on_set = ui_set};
    node_ui_set_switch_callbacks(&cbs);
    atomic_store(&s_changed, true);   /* gói telemetry đầu tiên mang trạng thái đèn/quạt */
    return ESP_OK;
}

bool node_switches_post_command(node_switch_t sw, const char *command_id, const char *action)
{
    if (s_queue == NULL || (unsigned)sw >= NODE_SWITCH_COUNT || command_id == NULL || action == NULL) {
        return false;
    }
    sw_req_t req = {.type = REQ_CMD, .sw = sw, .queued_us = esp_timer_get_time()};
    strlcpy(req.command_id, command_id, sizeof(req.command_id));
    strlcpy(req.action, action, sizeof(req.action));
    return xQueueSend(s_queue, &req, 0) == pdTRUE;
}

bool node_switches_get(node_switch_t sw, bool *on)
{
    if (s_queue == NULL || (unsigned)sw >= NODE_SWITCH_COUNT || on == NULL) {
        return false;
    }
    *on = board_relay_get(RELAYS[sw]);
    return true;
}

bool node_switches_take_changed(void)
{
    return atomic_exchange(&s_changed, false);
}
