#include "node_curtain.h"

#include <stdatomic.h>
#include <stdint.h>
#include <stdio.h>
#include <stdlib.h>
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

static const char *TAG = "node_curtain";
static const char *CMD_TAG = "node_cmd";   /* vết lệnh: [2] thực thi (node_app.c giải thích các bước) */

#define CUR_QUEUE_LEN 12
#define CUR_TASK_STACK 4096
#define CUR_TASK_PRIO 4
#define CMD_MAX_AGE_US (2500 * 1000)   /* Gateway chờ ack 3 s: lệnh xếp hàng lâu hơn thì bỏ */
#define REFRESH_US (250 * 1000)        /* đang chạy: cập nhật màn hình */
#define SAVE_EVERY_US (2000 * 1000)    /* đang chạy: lưu vị trí vào NVS */
#define JOG_CHUNK 1024                 /* nửa bước mỗi lần nhích (~1,5 s ở 1500 µs/bước): lỡ mất sự kiện thả tay thì tự dừng */
#define MIN_TRAVEL 512                 /* hành trình ngắn hơn: chắc chắn đặt nhầm mốc */
#define HALF_STEPS_PER_REV 4096        /* 28BYJ-48 — chỉ để báo số vòng trên màn hình */
#define KEY_POS "cur_pos"
#define KEY_TRAVEL "cur_travel"

typedef enum { REQ_CMD, REQ_UI, REQ_DONE } req_type_t;

typedef struct {
    req_type_t type;
    node_ui_curtain_op_t op;   /* REQ_UI */
    int value;                 /* REQ_UI: % của SET_PERCENT */
    char command_id[65];       /* REQ_CMD */
    char action[33];           /* REQ_CMD */
    int64_t queued_us;         /* REQ_CMD */
} cur_req_t;

static QueueHandle_t s_queue;
static atomic_bool s_changed;
static atomic_int s_percent;
static atomic_int s_report_percent;   /* % báo Gateway/Server: đích khi đang chạy, vị trí khi đứng yên */
static atomic_bool s_jogging;   /* đang giữ nút nhích trên màn hình: từ chối lệnh từ xa */

/* Chỉ task node_curtain (và start, trước khi tạo task) dùng. */
static int32_t s_travel;        /* nửa bước từ ĐÓNG hẳn tới MỞ hẳn */
static bool s_calibrated;       /* hành trình đọc từ NVS (đã hiệu chuẩn), không phải mặc định menuconfig */
static int32_t s_target;
static int s_last_level = 100;  /* mức mở vừa dùng (%): gạt công tắc trên màn hình sang bật thì mở lại mức này */
static bool s_run_active;       /* đã ra lệnh chạy, chưa xử lý lúc dừng */
static int32_t s_saved_pos;
static bool s_saved_valid;
static int64_t s_last_save_us;
static int64_t s_last_ui_us;

static int percent_of(int32_t pos)
{
    if (pos <= 0) {
        return 0;
    }
    if (pos >= s_travel) {
        return 100;
    }
    return (int)(((int64_t)pos * 100 + s_travel / 2) / s_travel);
}

static int32_t position_of(int percent)
{
    if (percent <= 0) {
        return 0;
    }
    if (percent >= 100) {
        return s_travel;
    }
    return (int32_t)((int64_t)s_travel * percent / 100);
}

/* "set_pos_45" → 45; -1 nếu không phải dạng set_pos_<0..100>. */
static int parse_set_pos(const char *action)
{
    if (strncmp(action, "set_pos_", 8) != 0) {
        return -1;
    }
    const char *p = action + 8;
    if (*p == '\0' || strlen(p) > 3) {
        return -1;
    }
    int v = 0;
    for (; *p != '\0'; p++) {
        if (*p < '0' || *p > '9') {
            return -1;
        }
        v = v * 10 + (*p - '0');
    }
    return v <= 100 ? v : -1;
}

static void save_position(int32_t pos)
{
    s_last_save_us = esp_timer_get_time();
    if (s_saved_valid && pos == s_saved_pos) {
        return;
    }
    if (node_state_set_i32(KEY_POS, pos) == ESP_OK) {
        s_saved_pos = pos;
        s_saved_valid = true;
    }
}

/* Đẩy vị trí lên màn hình + biến đọc cho telemetry. */
static void publish(void)
{
    int32_t pos = board_curtain_position();
    bool moving = board_curtain_moving();
    int pct = percent_of(pos);
    atomic_store(&s_percent, pct);
    atomic_store(&s_report_percent, moving ? percent_of(s_target) : pct);
    node_ui_set_curtain(pct, percent_of(s_target), moving, pos, s_travel, s_calibrated);
    s_last_ui_us = esp_timer_get_time();
}

/* Chạy tới `target` (nửa bước). clamp: giữ trong [0, hành trình] — mọi lệnh trừ nhích khi hiệu chuẩn. */
static esp_err_t start_move(int32_t target, bool clamp)
{
    if (clamp) {
        if (target < 0) {
            target = 0;
        } else if (target > s_travel) {
            target = s_travel;
        }
    }
    esp_err_t err = board_curtain_move_to(target);
    if (err != ESP_OK) {
        ESP_LOGE(TAG, "motor start failed: %s", esp_err_to_name(err));
        node_ui_set_curtain_message(NODE_UI_MSG_BAD, "Không chạy được động cơ rèm. Khởi động lại Node; vẫn lỗi thì "
                                                     "kiểm chân ULN2003 trong menuconfig.");
        /* Công tắc / nút mức trên màn hình chính đã đổi theo tay người dùng: đưa về vị trí thật + nói lý do ở dòng dưới. */
        publish();
        node_ui_set_notice(NODE_UI_MSG_BAD, "Rèm: không chạy được động cơ, kiểm dây ULN2003");
        node_audio_beep(NODE_AUDIO_BEEP_ERROR);
        return err;
    }
    if (!s_run_active) {
        s_last_save_us = esp_timer_get_time();
    }
    if (clamp && target > 0) {
        s_last_level = percent_of(target) > 0 ? percent_of(target) : 100;   /* mức vừa chọn (web, Gateway, màn hình) */
    }
    bool new_goal = clamp && target != s_target;
    s_target = target;
    s_run_active = true;   /* kể cả khi đã ở đích: vòng lặp xử lý "dừng" → lưu, màn hình, telemetry */
    publish();
    if (new_goal) {
        /* Báo ngay mức ĐÍCH (Gateway, web đổi màu ngay, không chờ rèm chạy xong). Nhích lúc hiệu chuẩn không báo. */
        atomic_store(&s_changed, true);
    }
    return ESP_OK;
}

/* Động cơ vừa dừng (tới đích hoặc bị dừng). */
static void on_stopped(void)
{
    s_run_active = false;
    atomic_store(&s_jogging, false);
    int32_t pos = board_curtain_position();
    /* Đích = chỗ đã dừng (kể cả dừng giữa chừng): lệnh sau tới đúng đích cũ vẫn là "đích mới" → báo telemetry ngay. */
    s_target = pos;
    save_position(pos);
    publish();
    atomic_store(&s_changed, true);
    ESP_LOGI(CMD_TAG, "[2] curtain stopped at %d%% (%ld / %ld half-steps)", percent_of(pos), (long)pos, (long)s_travel);
}

/* ---- lệnh từ Server ----------------------------------------------------------------------------------- */

static void handle_command(const cur_req_t *req)
{
    const char *cid = req->command_id;
    const char *a = req->action;
    if (esp_timer_get_time() - req->queued_us > CMD_MAX_AGE_US) {
        ESP_LOGW(CMD_TAG, "[2] curtain %s DROPPED: waited too long in queue   (cmd %s)", a, cid);
        node_link_send_cmd_ack(cid, false, NODE_POWER_UNKNOWN);
        return;
    }
    if (atomic_load(&s_jogging)) {
        ESP_LOGW(CMD_TAG, "[2] curtain %s REJECTED: curtain is being calibrated on the screen   (cmd %s)", a, cid);
        node_link_send_cmd_ack(cid, false, NODE_POWER_UNKNOWN);
        return;
    }
    int32_t pos = board_curtain_position();
    if (strcmp(a, "stop") == 0) {
        ESP_LOGI(CMD_TAG, "[2] curtain stop requested at %d%%   [remote]", percent_of(pos));
        board_curtain_stop();
        node_link_send_cmd_ack(cid, true, percent_of(pos) > 0 ? NODE_POWER_ON : NODE_POWER_OFF);
        return;
    }
    int32_t target;
    int pct;
    if (strcmp(a, "turn_on") == 0) {
        target = s_travel;
    } else if (strcmp(a, "turn_off") == 0) {
        target = 0;
    } else if (strcmp(a, "toggle") == 0) {
        target = percent_of(pos) > 0 ? 0 : s_travel;
    } else if ((pct = parse_set_pos(a)) >= 0) {
        target = position_of(pct);
    } else {
        ESP_LOGW(CMD_TAG, "[2] curtain: unsupported action %s (turn_on / turn_off / toggle / stop / set_pos_N)   (cmd %s)",
                 a, cid);
        node_link_send_cmd_ack(cid, false, NODE_POWER_UNKNOWN);
        return;
    }
    esp_err_t err = start_move(target, true);
    if (err == ESP_OK) {
        ESP_LOGI(CMD_TAG, "[2] curtain %s: moving %d%% -> %d%% (ack now, position reported when it stops)   [remote]", a,
                 percent_of(pos), percent_of(target));
        node_audio_beep(target > 0 ? NODE_AUDIO_BEEP_ON : NODE_AUDIO_BEEP_OFF);
    }
    /* Ack ngay khi bắt đầu chạy (rèm chạy lâu hơn 3 s Gateway chờ); vị trí thật đi theo telemetry khi dừng. */
    node_link_send_cmd_ack(cid, err == ESP_OK,
                           err != ESP_OK ? NODE_POWER_UNKNOWN : target > 0 ? NODE_POWER_ON : NODE_POWER_OFF);
}

/* ---- màn hình ----------------------------------------------------------------------------------------- */

/* Vừa thả nút nhích rồi bấm đặt mốc ngay: lệnh dừng có hiệu lực ở bước kế tiếp (vài ms) — chờ một chút thay vì báo lỗi. */
static bool wait_stopped(void)
{
    for (int i = 0; i < 20 && board_curtain_moving(); i++) {
        vTaskDelay(pdMS_TO_TICKS(5));
    }
    return !board_curtain_moving();
}

static void mark_closed(void)
{
    if (!wait_stopped()) {
        node_ui_set_curtain_message(NODE_UI_MSG_WARN, "Rèm đang chạy: thả nút hoặc bấm DỪNG, đợi rèm đứng yên rồi bấm lại.");
        return;
    }
    int32_t old = board_curtain_position();
    if (board_curtain_set_position(0) != ESP_OK) {
        node_ui_set_curtain_message(NODE_UI_MSG_BAD, "Không đặt được mốc: động cơ chưa dừng hẳn, thử lại sau 1 giây.");
        return;
    }
    s_target = 0;
    save_position(0);
    publish();
    atomic_store(&s_changed, true);
    ESP_LOGI(TAG, "CLOSED mark set (counter was %ld)", (long)old);
    node_ui_set_curtain_message(NODE_UI_MSG_OK, "Đã đặt mốc ĐÓNG hẳn. Giờ giữ Nhích MỞ tới khi rèm mở hẳn rồi bấm Đặt là "
                                                "MỞ hẳn.");
}

static void mark_open(void)
{
    char msg[200];
    if (!wait_stopped()) {
        node_ui_set_curtain_message(NODE_UI_MSG_WARN, "Rèm đang chạy: thả nút hoặc bấm DỪNG, đợi rèm đứng yên rồi bấm lại.");
        return;
    }
    int32_t pos = board_curtain_position();
    if (pos < MIN_TRAVEL) {
        snprintf(msg, sizeof(msg),
                 "Rèm mới cách mốc ĐÓNG %ld bước (cần ít nhất %d). Đặt mốc ĐÓNG hẳn trước, rồi giữ Nhích MỞ tới khi rèm "
                 "mở hẳn.",
                 (long)pos, MIN_TRAVEL);
        node_ui_set_curtain_message(NODE_UI_MSG_BAD, msg);
        return;
    }
    esp_err_t err = node_state_set_i32(KEY_TRAVEL, pos);
    s_travel = pos;
    s_calibrated = true;
    publish();
    atomic_store(&s_changed, true);
    ESP_LOGI(TAG, "OPEN mark set: travel %ld half-steps", (long)pos);
    if (err != ESP_OK) {
        node_ui_set_curtain_message(NODE_UI_MSG_WARN, "Đã đặt mốc MỞ hẳn nhưng không lưu được vào bộ nhớ (NVS): mất điện "
                                                      "sẽ phải hiệu chuẩn lại.");
        return;
    }
    snprintf(msg, sizeof(msg), "Đã lưu hành trình %ld bước (khoảng %.1f vòng). Rèm đang MỞ hẳn (100%%).", (long)pos,
             (double)pos / HALF_STEPS_PER_REV);
    node_ui_set_curtain_message(NODE_UI_MSG_OK, msg);
}

static void handle_ui(const cur_req_t *req)
{
    switch (req->op) {
    case NODE_UI_CURTAIN_OPEN: {
        int level = s_last_level;   /* công tắc sang bật: mở lại mức vừa dùng */
        if (start_move(position_of(level), true) == ESP_OK) {
            ESP_LOGI(CMD_TAG, "[2] curtain: opening to %d%% (last level)   [screen]", level);
            node_audio_beep(NODE_AUDIO_BEEP_ON);
        }
        break;
    }
    case NODE_UI_CURTAIN_CLOSE:
        if (start_move(0, true) == ESP_OK) {
            ESP_LOGI(CMD_TAG, "[2] curtain: closing to 0%%   [screen]");
            node_audio_beep(NODE_AUDIO_BEEP_OFF);
        }
        break;
    case NODE_UI_CURTAIN_STOP:
        ESP_LOGI(CMD_TAG, "[2] curtain stop requested   [screen]");
        board_curtain_stop();
        break;
    case NODE_UI_CURTAIN_SET_PERCENT:
        if (start_move(position_of(req->value), true) == ESP_OK) {
            ESP_LOGI(CMD_TAG, "[2] curtain: moving to %d%%   [screen]", req->value);
        }
        break;
    case NODE_UI_CURTAIN_JOG_OPEN:
    case NODE_UI_CURTAIN_JOG_CLOSE: {
        /* Mỗi sự kiện (chạm, rồi lặp khi giữ) nối đích thêm 1 đoạn: giữ là chạy liên tục, bỏ qua giới hạn hành trình.
         * Chỉ đánh dấu đang nhích khi động cơ thật sự chạy — không thì cờ kẹt và mọi lệnh từ xa bị từ chối. */
        int32_t step = req->op == NODE_UI_CURTAIN_JOG_OPEN ? JOG_CHUNK : -JOG_CHUNK;
        if (start_move(board_curtain_position() + step, false) == ESP_OK) {
            atomic_store(&s_jogging, true);
        }
        break;
    }
    case NODE_UI_CURTAIN_JOG_RELEASE:
        if (atomic_load(&s_jogging)) {
            board_curtain_stop();   /* s_jogging xoá khi động cơ dừng hẳn (on_stopped) */
        }
        break;
    case NODE_UI_CURTAIN_MARK_CLOSED:
        mark_closed();
        break;
    case NODE_UI_CURTAIN_MARK_OPEN:
        mark_open();
        break;
    default:
        break;
    }
}

/* ---- task --------------------------------------------------------------------------------------------- */

static void cur_task(void *arg)
{
    (void)arg;
    cur_req_t req;
    for (;;) {
        TickType_t wait = s_run_active ? pdMS_TO_TICKS(REFRESH_US / 1000) : portMAX_DELAY;
        if (xQueueReceive(s_queue, &req, wait) == pdTRUE) {
            if (req.type == REQ_CMD) {
                handle_command(&req);
            } else if (req.type == REQ_UI) {
                handle_ui(&req);
            }
            /* REQ_DONE chỉ để đánh thức: việc lúc dừng làm ở dưới (không phụ thuộc sự kiện có tới hay không). */
        }
        if (!s_run_active) {
            continue;
        }
        if (board_curtain_moving()) {
            int64_t now = esp_timer_get_time();
            if (now - s_last_ui_us >= REFRESH_US) {
                publish();
            }
            if (now - s_last_save_us >= SAVE_EVERY_US) {
                save_position(board_curtain_position());   /* mất điện giữa chừng chỉ lệch ≤ 2 s đường chạy */
            }
        } else {
            on_stopped();
        }
    }
}

/* Chạy trong task esp_timer: chỉ đánh thức task rèm. */
static void on_motor_done(int32_t position, bool reached, void *ctx)
{
    (void)position;
    (void)reached;
    (void)ctx;
    QueueHandle_t q = s_queue;
    if (q != NULL) {
        const cur_req_t req = {.type = REQ_DONE};
        xQueueSend(q, &req, 0);
    }
}

/* Callback màn hình, chạy trong task LVGL: chỉ xếp hàng, không chặn. */
static void ui_op(node_ui_curtain_op_t op, int value, void *ctx)
{
    (void)ctx;
    const cur_req_t req = {.type = REQ_UI, .op = op, .value = value};
    if (xQueueSend(s_queue, &req, 0) != pdTRUE) {
        ESP_LOGW(TAG, "busy, screen request %d dropped", (int)op);
        if (op == NODE_UI_CURTAIN_JOG_RELEASE || op == NODE_UI_CURTAIN_STOP) {
            board_curtain_stop();   /* không bao giờ được mất lệnh dừng */
        }
    }
}

/* ---- API ---------------------------------------------------------------------------------------------- */

esp_err_t node_curtain_start(void)
{
    if (s_queue != NULL) {
        return ESP_OK;
    }
    s_queue = xQueueCreate(CUR_QUEUE_LEN, sizeof(cur_req_t));
    if (s_queue == NULL) {
        return ESP_ERR_NO_MEM;
    }
    esp_err_t err = board_curtain_init(on_motor_done, NULL);
    if (err != ESP_OK) {
        vQueueDelete(s_queue);
        s_queue = NULL;
        if (err != ESP_ERR_NOT_SUPPORTED) {
            ESP_LOGE(TAG, "curtain motor not available (%s): check GPIO in menuconfig (Node S3: rèm cửa)",
                     esp_err_to_name(err));
        }
        return err;
    }

    s_travel = board_curtain_default_travel();
    int32_t v;
    if (node_state_get_i32(KEY_TRAVEL, &v) == ESP_OK && v >= MIN_TRAVEL) {
        s_travel = v;
        s_calibrated = true;
    }
    int32_t pos = 0;
    if (node_state_get_i32(KEY_POS, &v) == ESP_OK) {
        pos = v;
        s_saved_pos = v;
        s_saved_valid = true;
    } else {
        ESP_LOGW(TAG, "no saved curtain position: assuming CLOSED — calibrate on the screen (Rèm cửa → Hiệu chuẩn)");
    }
    board_curtain_set_position(pos);
    s_target = pos;

    if (xTaskCreate(cur_task, "curtain", CUR_TASK_STACK, NULL, CUR_TASK_PRIO, NULL) != pdPASS) {
        /* Không để hàng đợi "sống" mà không ai xử lý: lệnh từ xa phải bị từ chối ngay (ack lỗi), không treo 3 s.
         * Động cơ đã init nhưng không bao giờ được lệnh chạy; callback dừng của nó không còn hàng đợi để gửi. */
        ESP_LOGE(TAG, "cannot start curtain task (no memory)");
        QueueHandle_t q = s_queue;
        s_queue = NULL;
        vQueueDelete(q);
        return ESP_ERR_NO_MEM;
    }
    publish();
    const node_ui_curtain_callbacks_t cbs = {.on_op = ui_op};
    node_ui_set_curtain_callbacks(&cbs);
    atomic_store(&s_changed, true);   /* gói telemetry đầu tiên mang vị trí rèm */
    ESP_LOGI(TAG, "curtain at %d%% (%ld / %ld half-steps, %s)", percent_of(pos), (long)pos, (long)s_travel,
             s_calibrated ? "calibrated" : "default travel — not calibrated yet");
    return ESP_OK;
}

bool node_curtain_post_command(const char *command_id, const char *action)
{
    if (s_queue == NULL || command_id == NULL || action == NULL) {
        return false;
    }
    cur_req_t req = {.type = REQ_CMD, .queued_us = esp_timer_get_time()};
    strlcpy(req.command_id, command_id, sizeof(req.command_id));
    strlcpy(req.action, action, sizeof(req.action));
    return xQueueSend(s_queue, &req, 0) == pdTRUE;
}

bool node_curtain_get_percent(int *percent)
{
    if (s_queue == NULL || percent == NULL) {
        return false;
    }
    *percent = atomic_load(&s_percent);
    return true;
}

bool node_curtain_get_report_percent(int *percent)
{
    if (s_queue == NULL || percent == NULL) {
        return false;
    }
    *percent = atomic_load(&s_report_percent);
    return true;
}

bool node_curtain_is_moving(void)
{
    return board_curtain_moving();
}

bool node_curtain_take_changed(void)
{
    return atomic_exchange(&s_changed, false);
}
