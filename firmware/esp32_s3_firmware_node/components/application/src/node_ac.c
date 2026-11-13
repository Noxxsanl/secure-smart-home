#include "node_ac.h"

#include <inttypes.h>
#include <stdatomic.h>
#include <stdint.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

#include "board_ir.h"
#include "esp_log.h"
#include "esp_timer.h"
#include "freertos/FreeRTOS.h"
#include "freertos/queue.h"
#include "freertos/task.h"
#include "node_ir_store.h"
#include "node_link.h"
#include "node_ui.h"

static const char *TAG = "node_ac";
static const char *CMD_TAG = "node_cmd";   /* vết lệnh: [2] thực thi (node_app.c giải thích các bước) */

#define AC_QUEUE_LEN 6
#define AC_TASK_STACK 6144         /* learn(): msg + dòng log + nvs_set_blob */
#define CMD_MAX_AGE_US (2500 * 1000)   /* Gateway chờ ack 3 s: lệnh xếp hàng lâu hơn thì bỏ, không phát IR muộn */
#define AC_TASK_PRIO 4
#define AC_DEFAULT_TEMP 26
#define IR_CARRIER_HZ 38000        /* VS1838B đã bỏ sóng mang nên không đo được; điều hòa hầu hết dùng 38 kHz */
#define LEARN_WAIT_MS 10000        /* chờ người dùng bấm remote */
#define LEARN_NEXT_FRAME_MS 250    /* khung tiếp theo của CÙNG một lần bấm (Daikin, Panasonic gửi 2–3 khung) */
#define LEARN_MIN_DURATIONS 16     /* ngắn hơn: nhiễu / đèn huỳnh quang, không phải mã remote */
#define IR_MAX_SPACE_US 32767      /* trần 15 bit của RMT ở 1 MHz */
#define LOG_PER_LINE 16

typedef enum { REQ_CMD, REQ_POWER, REQ_TEMP, REQ_LEARN, REQ_TEST } req_type_t;

typedef struct {
    req_type_t type;
    int value;                  /* REQ_POWER: 0/1; REQ_TEMP: °C; REQ_LEARN/REQ_TEST: slot */
    char command_id[65];        /* REQ_CMD */
    char action[33];            /* REQ_CMD */
    int64_t queued_us;          /* REQ_CMD: lúc nhận từ Gateway */
} ac_req_t;

static QueueHandle_t s_queue;
static atomic_bool s_learning;
static atomic_bool s_changed;
static atomic_int s_power = -1;              /* -1 chưa biết, 0 tắt, 1 bật */
static atomic_int s_setpoint = AC_DEFAULT_TEMP;

/* Chỉ task node_ac dùng. */
static uint16_t s_buf[NODE_IR_MAX_DURATIONS];
static _Atomic uint32_t s_learned;   /* bit 0 = TẮT, bit (t - 15) = t°C; task telemetry cũng đọc */

/* ---- mã đã học ---------------------------------------------------------------------------------------- */

static bool valid_slot(int slot)
{
    return slot == NODE_UI_AC_SLOT_OFF || (slot >= NODE_UI_AC_TEMP_MIN && slot <= NODE_UI_AC_TEMP_MAX);
}

static void slot_name(int slot, char *out, size_t cap)   /* tên khoá NVS */
{
    if (slot == NODE_UI_AC_SLOT_OFF) {
        strlcpy(out, "ac_off", cap);
    } else {
        snprintf(out, cap, "ac_t%d", slot);
    }
}

static void slot_label(int slot, char *out, size_t cap)   /* chữ trên màn hình */
{
    if (slot == NODE_UI_AC_SLOT_OFF) {
        strlcpy(out, "TẮT", cap);
    } else {
        snprintf(out, cap, "%d°C", slot);
    }
}

static uint32_t slot_bit(int slot)   /* như node_ui_set_ac_learned: bit 0 = TẮT, bit (t - 15) = t°C */
{
    return slot == NODE_UI_AC_SLOT_OFF ? 1u : 1u << (slot - (NODE_UI_AC_TEMP_MIN - 1));
}

static void load_learned(void)
{
    uint32_t mask = 0;
    char name[NODE_IR_NAME_MAX + 1];
    for (int slot = NODE_UI_AC_TEMP_MIN - 1; slot <= NODE_UI_AC_TEMP_MAX; slot++) {
        int s = slot < NODE_UI_AC_TEMP_MIN ? NODE_UI_AC_SLOT_OFF : slot;
        slot_name(s, name, sizeof(name));
        if (node_ir_store_exists(name)) {
            mask |= slot_bit(s);
        }
    }
    atomic_store(&s_learned, mask);
    ESP_LOGI(TAG, "learned AC codes mask 0x%04" PRIx32, mask);
    node_ui_set_ac_learned(mask);
}

/* ---- phát ---------------------------------------------------------------------------------------------- */

static void publish_state(void)
{
    int power = atomic_load(&s_power);
    node_ui_set_ac_setpoint((float)atomic_load(&s_setpoint));
    node_ui_set_device(NODE_UI_DEV_AC, power);
    atomic_store(&s_changed, true);
}

/* Phát mã của slot; thành công thì đổi trạng thái (TẮT → tắt; t°C → bật, đặt t). */
static esp_err_t apply_slot(int slot)
{
    char name[NODE_IR_NAME_MAX + 1], label[12], msg[160];
    slot_name(slot, name, sizeof(name));
    slot_label(slot, label, sizeof(label));

    uint32_t carrier = 0;
    size_t count = 0;
    esp_err_t err = node_ir_store_load(name, &carrier, s_buf, NODE_IR_MAX_DURATIONS, &count);
    if (err == ESP_OK) {
        err = board_ir_send(s_buf, count, carrier);
    }
    if (err != ESP_OK) {
        if (err == ESP_ERR_NOT_FOUND) {
            snprintf(msg, sizeof(msg), "Chưa học mã %s. Bấm Học mã, chạm ô %s rồi bấm remote điều hòa.", label, label);
            char notice[64];
            snprintf(notice, sizeof(notice), "Điều hòa: chưa học mã %s", label);
            node_ui_set_notice(NODE_UI_MSG_WARN, notice);
        } else {
            snprintf(msg, sizeof(msg), "Không phát được mã %s (%s). Kiểm dây LED phát hồng ngoại.", label,
                     esp_err_to_name(err));
        }
        ESP_LOGW(TAG, "send %s failed: %s", name, esp_err_to_name(err));
        node_ui_set_ac_message(NODE_UI_MSG_BAD, msg);
        publish_state();   /* trả số trên bảng về trạng thái đã xác nhận */
        atomic_store(&s_changed, false);
        return err;
    }

    if (slot == NODE_UI_AC_SLOT_OFF) {
        atomic_store(&s_power, 0);
    } else {
        atomic_store(&s_power, 1);
        atomic_store(&s_setpoint, slot);
    }
    ESP_LOGI(TAG, "sent %s (%u durations)", name, (unsigned)count);
    snprintf(msg, sizeof(msg), "Đã phát mã %s. Điều hòa không phản ứng: đưa LED lại gần / hướng thẳng mắt nhận.",
             label);
    node_ui_set_ac_message(NODE_UI_MSG_OK, msg);
    publish_state();
    return ESP_OK;
}

static bool learn(int slot);

/* "learn_off" → 0, "learn_t<16..30>" → nhiệt độ; -1 nếu không phải lệnh học mã hợp lệ. */
static int parse_learn_slot(const char *action)
{
    if (strcmp(action, "learn_off") == 0) {
        return NODE_UI_AC_SLOT_OFF;
    }
    if (strncmp(action, "learn_t", 7) != 0) {
        return -1;
    }
    char *end = NULL;
    long t = strtol(action + 7, &end, 10);
    return (end != NULL && end != action + 7 && *end == '\0' && t >= NODE_UI_AC_TEMP_MIN && t <= NODE_UI_AC_TEMP_MAX)
               ? (int)t
               : -1;
}

/*
 * Lệnh Server: turn_on (mã ở nhiệt độ đang đặt), turn_off, set_temp_<16..30>; học mã từ web: learn_off,
 * learn_t<16..30> — chờ người dùng bấm remote (≤ 10 s) rồi mới ack (Gateway chờ 14 s, Server 15 s).
 */
static void handle_command(const ac_req_t *req)
{
    if (esp_timer_get_time() - req->queued_us > CMD_MAX_AGE_US) {
        /* Xếp sau việc học mã (≤ 10 s): Gateway/Server đã báo hết giờ — phát lúc này sẽ đổi điều hòa ngoài ý muốn. */
        ESP_LOGW(CMD_TAG, "[2] ac %s DROPPED: waited too long in queue   (cmd %s)", req->action, req->command_id);
        node_link_send_cmd_ack(req->command_id, false, NODE_POWER_UNKNOWN);
        return;
    }
    int learn_slot = parse_learn_slot(req->action);
    if (learn_slot >= 0) {
        ESP_LOGI(CMD_TAG, "[2] ac %s: waiting up to 10 s for the remote   [remote]", req->action);
        bool learned = learn(learn_slot);
        if (learned) {
            ESP_LOGI(CMD_TAG, "[2] ac %s: IR code captured and saved", req->action);
        } else {
            ESP_LOGW(CMD_TAG, "[2] ac %s FAILED: no usable IR signal (reason shown on the AC panel of the screen)",
                     req->action);
        }
        node_link_send_cmd_ack(req->command_id, learned, NODE_POWER_UNKNOWN);
        return;
    }
    int slot = -1;
    if (strcmp(req->action, "turn_on") == 0) {
        slot = atomic_load(&s_setpoint);
    } else if (strcmp(req->action, "turn_off") == 0) {
        slot = NODE_UI_AC_SLOT_OFF;
    } else if (strncmp(req->action, "set_temp_", 9) == 0) {
        char *end = NULL;
        long t = strtol(req->action + 9, &end, 10);
        if (end != NULL && *end == '\0' && t >= NODE_UI_AC_TEMP_MIN && t <= NODE_UI_AC_TEMP_MAX) {
            slot = (int)t;
        }
    }
    if (slot < 0) {
        ESP_LOGW(CMD_TAG, "[2] ac: unsupported action %s   (cmd %s)", req->action, req->command_id);
        node_link_send_cmd_ack(req->command_id, false, NODE_POWER_UNKNOWN);
        return;
    }
    bool ok = apply_slot(slot) == ESP_OK;
    if (ok) {
        ESP_LOGI(CMD_TAG, "[2] ac %s: IR code sent, AC %s, setpoint %d C   [remote]", req->action,
                 atomic_load(&s_power) == 1 ? "ON" : "OFF", atomic_load(&s_setpoint));
    } else {
        ESP_LOGW(CMD_TAG, "[2] ac %s FAILED: IR code not learned yet or IR send error", req->action);
    }
    node_power_t power = !ok ? NODE_POWER_UNKNOWN : atomic_load(&s_power) == 1 ? NODE_POWER_ON : NODE_POWER_OFF;
    node_link_send_cmd_ack(req->command_id, ok, power);
}

/* ---- học mã -------------------------------------------------------------------------------------------- */

/* Bỏ khung cũ còn nằm trong mắt thu (VD tiếng vọng của chính LED phát). */
static void drain_receiver(void)
{
    size_t n;
    for (int i = 0; i < 4; i++) {
        esp_err_t err = board_ir_receive(s_buf, NODE_IR_MAX_DURATIONS, &n, 0);
        if (err == ESP_ERR_TIMEOUT || err == ESP_ERR_INVALID_STATE) {
            return;
        }
    }
}

/*
 * Thu 1 lần bấm remote vào s_buf. Mắt thu tự gộp các khung cách nhau < BOARD_IR_FRAME_IDLE_US (30 ms); khung cách xa
 * hơn đến thành lần nhận riêng → ghép lại, chèn khoảng lặng ước lượng giữa 2 khung:
 *   lần nhận kết thúc ≈ cạnh cuối của khung + 30 ms  ⇒  khoảng lặng = t_kết_thúc_2 - t_kết_thúc_1 - tổng thời lượng khung 2.
 */
static esp_err_t capture(size_t *total, unsigned *frames)
{
    size_t n = 0;
    esp_err_t err = board_ir_receive(s_buf, NODE_IR_MAX_DURATIONS, &n, LEARN_WAIT_MS);
    if (err != ESP_OK) {
        return err;
    }
    if (n == 0) {
        return ESP_ERR_INVALID_RESPONSE;   /* khung toàn nhiễu (không có mark nào) */
    }
    int64_t prev_end = esp_timer_get_time();
    *frames = 1;
    while (n + 2 < NODE_IR_MAX_DURATIONS) {
        /* n lẻ = khung kết thúc bằng mark → ô n dành cho khoảng lặng; khung sau luôn bắt đầu ở chỉ số chẵn (mark). */
        size_t off = n + (n % 2);
        size_t m = 0;
        err = board_ir_receive(s_buf + off, NODE_IR_MAX_DURATIONS - off, &m, LEARN_NEXT_FRAME_MS);
        if (err == ESP_ERR_TIMEOUT) {
            break;
        }
        if (err != ESP_OK) {
            return err;
        }
        if (m == 0) {
            break;   /* khung sau toàn nhiễu: giữ phần đã thu */
        }
        int64_t end = esp_timer_get_time();
        int64_t sum = 0;
        for (size_t i = 0; i < m; i++) {
            sum += s_buf[off + i];
        }
        int64_t gap = end - prev_end - sum;
        if (gap < BOARD_IR_FRAME_IDLE_US) {
            gap = BOARD_IR_FRAME_IDLE_US;
        } else if (gap > IR_MAX_SPACE_US) {
            gap = IR_MAX_SPACE_US;
        }
        if (n % 2 == 1) {
            s_buf[n] = (uint16_t)gap;
        } else {
            int64_t merged = (int64_t)s_buf[n - 1] + gap;
            s_buf[n - 1] = (uint16_t)(merged > IR_MAX_SPACE_US ? IR_MAX_SPACE_US : merged);
        }
        n = off + m;
        prev_end = end;
        (*frames)++;
    }
    *total = n;
    return ESP_OK;
}

/* In mã thô ra log để xem cấu trúc (README, mục Hồng ngoại): header mark/space, rồi từng cặp mark/space = 1 bit. */
static void log_code(const char *name, size_t count, unsigned frames)
{
    ESP_LOGI(TAG, "IR code %s: %u durations, %u frame(s), header mark %u us / space %u us, ~%u bits", name,
             (unsigned)count, frames, s_buf[0], count > 1 ? s_buf[1] : 0,
             (unsigned)((count > 2 * frames ? count - 2 * frames : 0) / 2));
    char line[LOG_PER_LINE * 7 + 1];
    for (size_t i = 0; i < count; i += LOG_PER_LINE) {
        size_t len = 0;
        for (size_t j = i; j < count && j < i + LOG_PER_LINE; j++) {
            len += (size_t)snprintf(line + len, sizeof(line) - len, "%u ", s_buf[j]);
        }
        ESP_LOGI(TAG, "  [%3u] %s", (unsigned)i, line);
    }
}

/* Học 1 mã (chặn tới 10 s). true = đã thu + lưu. */
static bool learn(int slot)
{
    bool saved = false;
    char name[NODE_IR_NAME_MAX + 1], label[12], msg[200];
    slot_name(slot, name, sizeof(name));
    slot_label(slot, label, sizeof(label));
    atomic_store(&s_learning, true);

    snprintf(msg, sizeof(msg), "Học ô %s: chĩa remote vào mắt thu, bấm nút trong 10 giây%s", label,
             slot == NODE_UI_AC_SLOT_OFF ? " (nút nguồn khi điều hòa đang bật)." : " (chế độ Lạnh, đúng nhiệt độ).");
    node_ui_set_ac_message(NODE_UI_MSG_WARN, msg);
    drain_receiver();

    size_t count = 0;
    unsigned frames = 0;
    node_ui_set_ac_learning(slot, LEARN_WAIT_MS);   /* ô nháy viền + thanh đếm ngược trong lúc chờ remote */
    esp_err_t err = capture(&count, &frames);
    node_ui_set_ac_learning(slot, 0);
    if (err == ESP_ERR_INVALID_RESPONSE) {   /* toàn nhiễu → báo như tín hiệu quá ngắn */
        err = ESP_OK;
        count = 0;
    }
    if (err == ESP_ERR_TIMEOUT) {
        node_ui_set_ac_message(NODE_UI_MSG_BAD, "Không thấy tín hiệu. Kiểm mắt thu VS1838B (3V3, GND, chân OUT) "
                                                "và chĩa remote gần hơn rồi chạm ô để thử lại.");
    } else if (err == ESP_ERR_INVALID_SIZE) {
        node_ui_set_ac_message(NODE_UI_MSG_BAD, "Mã quá dài so với bộ nhớ thu (có thể đã giữ nút remote). "
                                                "Bấm nhả 1 lần rồi thử lại.");
    } else if (err != ESP_OK) {
        snprintf(msg, sizeof(msg), "Lỗi mắt thu hồng ngoại (%s).", esp_err_to_name(err));
        node_ui_set_ac_message(NODE_UI_MSG_BAD, msg);
    } else if (count < LEARN_MIN_DURATIONS) {
        snprintf(msg, sizeof(msg), "Tín hiệu quá ngắn (%u xung), giống nhiễu hơn mã remote. Thử lại, che bớt đèn.",
                 (unsigned)count);
        node_ui_set_ac_message(NODE_UI_MSG_WARN, msg);
    } else if ((err = node_ir_store_save(name, IR_CARRIER_HZ, s_buf, count)) != ESP_OK) {
        snprintf(msg, sizeof(msg), "Thu được mã nhưng không lưu được (%s). Bộ nhớ NVS có thể đã đầy.",
                 esp_err_to_name(err));
        node_ui_set_ac_message(NODE_UI_MSG_BAD, msg);
    } else {
        log_code(name, count, frames);
        uint32_t mask = atomic_fetch_or(&s_learned, slot_bit(slot)) | slot_bit(slot);
        node_ui_set_ac_learned(mask);
        atomic_store(&s_changed, true);   /* gửi ac_codes mới lên Server ngay */
        saved = true;
        snprintf(msg, sizeof(msg), "Đã học mã %s: %u khung, %u xung. Giữ lâu ô %s để phát thử.", label, frames,
                 (unsigned)count, label);
        node_ui_set_ac_message(NODE_UI_MSG_OK, msg);
    }
    atomic_store(&s_learning, false);
    return saved;
}

/* ---- task + callback màn hình ------------------------------------------------------------------------- */

static void ac_task(void *arg)
{
    (void)arg;
    ac_req_t req;
    for (;;) {
        if (xQueueReceive(s_queue, &req, portMAX_DELAY) != pdTRUE) {
            continue;
        }
        switch (req.type) {
        case REQ_CMD:
            handle_command(&req);
            break;
        case REQ_POWER:
            apply_slot(req.value ? atomic_load(&s_setpoint) : NODE_UI_AC_SLOT_OFF);
            break;
        case REQ_TEMP:
            apply_slot(req.value);
            break;
        case REQ_LEARN:
            learn(req.value);
            break;
        case REQ_TEST:
            apply_slot(req.value);
            break;
        }
    }
}

/* Callback chạy trong task LVGL: chỉ xếp hàng, không chặn. */
static void post_ui(req_type_t type, int value)
{
    ac_req_t req = {.type = type, .value = value};
    if (xQueueSend(s_queue, &req, 0) != pdTRUE) {
        ESP_LOGW(TAG, "busy, UI request dropped");
    }
}

static void ui_power(bool on, void *ctx)
{
    (void)ctx;
    post_ui(REQ_POWER, on ? 1 : 0);
}

static void ui_set_temp(int temp_c, void *ctx)
{
    (void)ctx;
    if (valid_slot(temp_c) && temp_c != NODE_UI_AC_SLOT_OFF) {
        post_ui(REQ_TEMP, temp_c);
    }
}

static void ui_learn(int slot, void *ctx)
{
    (void)ctx;
    if (valid_slot(slot)) {
        post_ui(REQ_LEARN, slot);
    }
}

static void ui_test(int slot, void *ctx)
{
    (void)ctx;
    if (valid_slot(slot)) {
        post_ui(REQ_TEST, slot);
    }
}

/* ---- API ---------------------------------------------------------------------------------------------- */

esp_err_t node_ac_start(void)
{
    if (s_queue != NULL) {
        return ESP_OK;
    }
    esp_err_t err = board_ir_init();
    if (err != ESP_OK) {
        ESP_LOGW(TAG, "IR not available (%s): AC control disabled", esp_err_to_name(err));
        node_ui_set_ac_message(NODE_UI_MSG_BAD, "Hồng ngoại chưa chạy: kiểm chân trong menuconfig (Node S3: hồng ngoại).");
        return err;
    }
    s_queue = xQueueCreate(AC_QUEUE_LEN, sizeof(ac_req_t));
    if (s_queue == NULL || xTaskCreate(ac_task, "ac_ir", AC_TASK_STACK, NULL, AC_TASK_PRIO, NULL) != pdPASS) {
        ESP_LOGE(TAG, "cannot start AC task (no memory)");
        return ESP_ERR_NO_MEM;
    }
    load_learned();
    node_ui_set_ac_setpoint((float)AC_DEFAULT_TEMP);
    const node_ui_ac_callbacks_t cbs = {
        .on_power = ui_power, .on_set_temp = ui_set_temp, .on_learn = ui_learn, .on_test = ui_test};
    node_ui_set_ac_callbacks(&cbs);
    return ESP_OK;
}

bool node_ac_post_command(const char *command_id, const char *action)
{
    if (s_queue == NULL || command_id == NULL || action == NULL) {
        return false;
    }
    if (atomic_load(&s_learning)) {
        ESP_LOGW(CMD_TAG, "[2] ac %s REJECTED: learning an IR code on the screen   (cmd %s)", action, command_id);
        return false;
    }
    ac_req_t req = {.type = REQ_CMD, .queued_us = esp_timer_get_time()};
    strlcpy(req.command_id, command_id, sizeof(req.command_id));
    strlcpy(req.action, action, sizeof(req.action));
    return xQueueSend(s_queue, &req, 0) == pdTRUE;
}

bool node_ac_get_state(bool *on, int *setpoint_c)
{
    int power = atomic_load(&s_power);
    if (power < 0) {
        return false;
    }
    *on = power == 1;
    *setpoint_c = atomic_load(&s_setpoint);
    return true;
}

bool node_ac_get_codes(uint32_t *mask)
{
    if (s_queue == NULL) {
        return false;   /* IR chưa chạy: chưa biết mã nào */
    }
    *mask = atomic_load(&s_learned);
    return true;
}

bool node_ac_take_changed(void)
{
    return atomic_exchange(&s_changed, false);
}
