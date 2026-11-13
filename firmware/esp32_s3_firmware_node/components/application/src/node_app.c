#include "node_app.h"

#include <stdatomic.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <time.h>

#include "board_display.h"
#include "board_sensors.h"
#include "esp_check.h"
#include "esp_log.h"
#include "esp_timer.h"
#include "freertos/FreeRTOS.h"
#include "freertos/task.h"
#include "node_ac.h"
#include "node_audio.h"
#include "node_config.h"
#include "node_curtain.h"
#include "node_link.h"
#include "node_status_led.h"
#include "node_switches.h"
#include "node_telemetry.h"
#include "node_time.h"
#include "node_ui.h"
#include "nvs_flash.h"
#include "sdkconfig.h"

static const char *TAG = "node_app";
/* Vết của 1 lệnh từ Server, lọc riêng được khi monitor (README, mục Theo dõi lệnh):
 *   [1] nhận lệnh (đây)  [2] thực thi (node_switches / node_curtain / node_ac)  [3] ack (node_link)  [4] báo trạng thái */
static const char *CMD_TAG = "node_cmd";

#define LOCAL_TZ "<+07>-7"   /* như Gateway: giờ Việt Nam cho màn hình; giờ hệ thống và HMAC vẫn là UTC */

#define CLIMATE_PERIOD_MS 2000
#define CLIMATE_FIND_RETRY_MS 5000   /* chưa thấy cảm biến: tìm lại (cắm dây sau khi khởi động vẫn nhận) */
#define CLIMATE_MAX_FAILS 3          /* đọc lỗi liên tiếp bấy nhiêu lần thì báo lỗi lên màn hình */
#define CLIMATE_LOG_EVERY 5          /* log 1 trong 5 lần đọc (10 s/lần) */
#define CLIMATE_FRESH_US ((int64_t)3 * CLIMATE_PERIOD_MS * 1000)   /* số đo cũ hơn: không gửi (cảm biến vừa lỗi) */
#define CLIMATE_TASK_STACK 4096
#define CLIMATE_TASK_PRIO 3

#define REPORT_PERIOD_MS 200
#define REPORT_TASK_STACK 5120       /* node_telemetry_send (payload 247 B + HMAC) + dòng log [4] 160 B + printf %f */
#define REPORT_TASK_PRIO 3
#define TELEMETRY_INTERVAL_US ((int64_t)CONFIG_NODE_APP_TELEMETRY_INTERVAL_S * 1000 * 1000)
#define TELEMETRY_RETRY_US ((int64_t)1000 * 1000)
#define AC_CODES_RESYNC_US ((int64_t)10 * 60 * 1000 * 1000)   /* ac_codes gửi khi đổi + 10 phút/lần cho chắc */
#define MAX_METRICS 8

/* Đọc sau node_app_start; secret giữ trong RAM suốt đời chạy để ký telemetry (không log — bất biến 2). */
static node_config_t s_cfg;
static bool s_paired;   /* node_link đã chạy (có identity + MAC Gateway + LMK) */

/* Số đo mới nhất: task climate ghi, task report đọc. */
static portMUX_TYPE s_climate_mux = portMUX_INITIALIZER_UNLOCKED;
static float s_temperature;
static float s_humidity;
static int64_t s_climate_us;            /* lúc đọc được (esp_timer); 0 = chưa có số đo hợp lệ */
static atomic_bool s_climate_fault;     /* không thấy / đọc lỗi SHT31 → LED đỏ */
static atomic_bool s_load_fault;        /* relay / động cơ rèm không khởi tạo được → LED đỏ */

/* Chỉ task report dùng. */
static int64_t s_next_send_us;          /* gói trạng thái kế tiếp (0 = ngay) */
static bool s_state_dirty;              /* tải đã đổi mà chưa báo được: gói kế in dòng [4] của node_cmd */
static bool s_codes_sent;
static uint32_t s_codes_last;
static int64_t s_codes_next_us;
static int64_t s_codes_retry_us;

/* ---- ESP-NOW ------------------------------------------------------------------------------------------ */

/* Dòng thông báo trên màn hình: "Lệnh từ xa: bật đèn" (từ web/app qua Server, hoặc từ màn hình Gateway). */
static void notice_remote_command(const char *target, const char *action)
{
    static const struct {
        const char *target;
        const char *name;
        const char *on;
        const char *off;
    } devs[] = {
        {"lamp", "đèn", "bật", "tắt"},
        {"fan", "quạt", "bật", "tắt"},
        {"curtain", "rèm", "mở", "đóng"},
        {"ac", "điều hòa", "bật", "tắt"},
    };
    char msg[80];
    for (size_t i = 0; i < sizeof(devs) / sizeof(devs[0]); i++) {
        if (strcmp(target, devs[i].target) != 0) {
            continue;
        }
        if (strcmp(action, "turn_on") == 0 || strcmp(action, "turn_off") == 0) {
            snprintf(msg, sizeof(msg), "Lệnh từ xa: %s %s", strcmp(action, "turn_on") == 0 ? devs[i].on : devs[i].off,
                     devs[i].name);
        } else if (strncmp(action, "set_pos_", 8) == 0) {
            snprintf(msg, sizeof(msg), "Lệnh từ xa: mở %s %s%%", devs[i].name, action + 8);
        } else if (strncmp(action, "set_temp_", 9) == 0) {
            snprintf(msg, sizeof(msg), "Lệnh từ xa: đặt %s %s°C", devs[i].name, action + 9);
        } else if (strncmp(action, "learn_", 6) == 0) {
            snprintf(msg, sizeof(msg), "Lệnh từ xa: học mã remote %s", devs[i].name);
        } else {
            snprintf(msg, sizeof(msg), "Lệnh từ xa: %s (%s)", devs[i].name, action);
        }
        node_ui_set_notice(NODE_UI_MSG_INFO, msg);
        return;
    }
}

/*
 * Lệnh cho thiết bị con có params.target (Gateway thêm khi Server gửi tới UID "<node_id>-<target>"):
 *   ac → node_ac (phát IR đã học), lamp / fan → node_switches (relay), curtain → node_curtain (động cơ bước).
 * Module nhận lệnh tự gửi ack; không nhận (tắt trong menuconfig, đang bận, target lạ) → ack lỗi ngay để Gateway khỏi
 * chờ 3 s.
 */
static void on_cmd(const char *command_id, const char *action, const cJSON *params, void *ctx)
{
    (void)ctx;
    node_status_led_flash();
    const cJSON *target = params ? cJSON_GetObjectItemCaseSensitive(params, "target") : NULL;
    const char *t = cJSON_IsString(target) ? target->valuestring : NULL;
    /* Lệnh bấm trên màn hình Gateway có command_id "gw-…"; lệnh từ web/app (qua Server) là UUID. */
    ESP_LOGI(CMD_TAG, "[1] recv from %s: target=%s action=%s   (cmd %s)",
             strncmp(command_id, "gw-", 3) == 0 ? "gateway screen" : "server", t != NULL ? t : "-", action, command_id);
    bool accepted = false;
    if (t == NULL) {
        accepted = false;   /* lệnh cho chính Node (không có thiết bị con): chưa có */
    } else if (strcmp(t, "ac") == 0) {
        accepted = node_ac_post_command(command_id, action);
    } else if (strcmp(t, "lamp") == 0) {
        accepted = node_switches_post_command(NODE_SWITCH_LAMP, command_id, action);
    } else if (strcmp(t, "fan") == 0) {
        accepted = node_switches_post_command(NODE_SWITCH_FAN, command_id, action);
    } else if (strcmp(t, "curtain") == 0) {
        accepted = node_curtain_post_command(command_id, action);
    }
    if (!accepted) {
        ESP_LOGW(CMD_TAG, "[2] target=%s action=%s NOT accepted: unknown target, disabled in menuconfig or busy   (cmd %s)",
                 t != NULL ? t : "-", action, command_id);
        node_link_send_cmd_ack(command_id, false, NODE_POWER_UNKNOWN);
        return;
    }
    notice_remote_command(t, action);
}

/* Chạy trong task node_link: chỉ log; màn hình + LED do task report cập nhật. */
static void on_link_state(bool online, uint8_t channel, void *ctx)
{
    (void)ctx;
    if (online) {
        ESP_LOGI(TAG, "gateway online (channel %u)", channel);
    } else {
        ESP_LOGW(TAG, "gateway lost, searching");
    }
}

static void start_link(void)
{
    esp_err_t err = node_config_load(&s_cfg);
    if (err != ESP_OK) {
        ESP_LOGW(TAG, "node not provisioned (%s): flash nvs_dev.csv (README, Ghép nối Gateway)", esp_err_to_name(err));
        return;
    }
    ESP_LOGI(TAG, "device_id %s", s_cfg.device_id);
    const node_link_callbacks_t cbs = {.on_cmd = on_cmd, .on_state = on_link_state};
    err = node_link_start(&s_cfg, &cbs);
    if (err != ESP_OK) {
        ESP_LOGW(TAG, "ESP-NOW not started (%s): check pairing/gateway_mac and pairing/session_key in NVS",
                 esp_err_to_name(err));
        return;
    }
    s_paired = true;
}

/* ---- task report: màn hình kết nối, LED, TELEMETRY ---------------------------------------------------- */

/* Chấm kết nối ở tiêu đề + biểu tượng sóng ở dòng dưới: cập nhật khi trạng thái đổi. */
static void refresh_link_ui(void)
{
    static bool shown;
    static node_ui_link_t last_link;

    node_ui_link_t link = !s_paired               ? NODE_UI_LINK_UNPAIRED
                          : node_link_is_online() ? NODE_UI_LINK_ONLINE
                                                  : NODE_UI_LINK_SEARCHING;
    if (shown && link == last_link) {
        return;
    }
    shown = true;
    last_link = link;
    node_ui_set_link(link);
}

static void refresh_led(void)
{
    node_led_link_t link = !s_paired                                       ? NODE_LED_UNPAIRED
                           : node_link_is_online() && node_time_is_synced() ? NODE_LED_ONLINE
                                                                            : NODE_LED_SEARCHING;
    node_status_led_set_link(link);
    node_status_led_set_busy(node_curtain_is_moving());
    node_status_led_set_error(atomic_load(&s_climate_fault) || atomic_load(&s_load_fault));
}

static size_t add_climate(node_metric_t *m, size_t n, int64_t now_us)
{
    taskENTER_CRITICAL(&s_climate_mux);
    float t = s_temperature;
    float h = s_humidity;
    int64_t at = s_climate_us;
    taskEXIT_CRITICAL(&s_climate_mux);
    if (at == 0 || now_us - at > CLIMATE_FRESH_US) {
        return n;   /* cảm biến lỗi / chưa đọc được: gói chỉ mang trạng thái tải */
    }
    m[n++] = (node_metric_t){.key = "temperature", .value = t, .decimals = 1};
    m[n++] = (node_metric_t){.key = "humidity", .value = h, .decimals = 1};
    return n;
}

static size_t add_ac(node_metric_t *m, size_t n)
{
    bool on;
    int setpoint;
    if (node_ac_get_state(&on, &setpoint)) {   /* chưa phát mã nào từ lúc khởi động = chưa biết → không gửi */
        m[n++] = (node_metric_t){.key = "ac", .value = on ? 1.0f : 0.0f, .decimals = 0};
        m[n++] = (node_metric_t){.key = "ac_temp", .value = (float)setpoint, .decimals = 0};
    }
    return n;
}

/* lamp, fan: 0/1; curtain: 0 = đóng, 2..100 = % mở — quy ước chung với Gateway (1 nghĩa là "mở" không rõ %). */
static size_t add_loads(node_metric_t *m, size_t n)
{
    bool on;
    if (node_switches_get(NODE_SWITCH_LAMP, &on)) {
        m[n++] = (node_metric_t){.key = "lamp", .value = on ? 1.0f : 0.0f, .decimals = 0};
    }
    if (node_switches_get(NODE_SWITCH_FAN, &on)) {
        m[n++] = (node_metric_t){.key = "fan", .value = on ? 1.0f : 0.0f, .decimals = 0};
    }
    /* Rèm: đang chạy thì gửi mức ĐÍCH (ngay khi nhận lệnh — Gateway, web đổi màu không chờ rèm chạy xong), không gửi
     * vị trí giữa chừng (sẽ làm web nhảy mở/đóng qua lại); dừng xong gói "đã đổi" mang vị trí thật. */
    int pct;
    if (node_curtain_get_report_percent(&pct)) {
        int v = pct <= 0 ? 0 : pct < 2 ? 2 : pct;
        m[n++] = (node_metric_t){.key = "curtain", .value = (float)v, .decimals = 0};
    }
    return n;
}

/*
 * Gói TRẠNG THÁI: số đo + điều hòa + đèn/quạt/rèm (~230 byte với device_id 14 ký tự). Không kèm ac_codes: cả gói
 * phải ≤ 246 byte (1 khung ESP-NOW) — ac_codes đi gói riêng (send_codes).
 */
/* "lamp=1 fan=0 curtain=45 ..." cho dòng log [4]. */
static void format_metrics(const node_metric_t *m, size_t n, char *out, size_t cap)
{
    size_t used = 0;
    out[0] = '\0';
    for (size_t i = 0; i < n && used < cap; i++) {
        int w = snprintf(out + used, cap - used, "%s%s=%.*f", i ? " " : "", m[i].key, m[i].decimals, (double)m[i].value);
        if (w < 0 || (size_t)w >= cap - used) {
            break;
        }
        used += (size_t)w;
    }
}

static void send_state(int64_t now_us, bool changed)
{
    node_metric_t m[MAX_METRICS];
    size_t n = add_climate(m, 0, now_us);
    n = add_ac(m, n);
    n = add_loads(m, n);
    if (n == 0) {
        s_next_send_us = now_us + TELEMETRY_INTERVAL_US;   /* chưa có gì để gửi (cảm biến lỗi, mọi tải tắt) */
        return;
    }
    esp_err_t err = node_telemetry_send(&s_cfg, m, n);
    if (err == ESP_OK) {
        s_state_dirty = false;
        s_next_send_us = now_us + TELEMETRY_INTERVAL_US;
        node_status_led_flash();
        ESP_LOGI(TAG, "telemetry sent to gateway (%u fields)", (unsigned)n);
        if (changed) {   /* tải vừa đổi (lệnh Server hoặc bấm màn hình): Gateway + Server cập nhật theo gói này */
            char text[160];
            format_metrics(m, n, text, sizeof(text));
            ESP_LOGI(CMD_TAG, "[4] state -> gateway: %s", text);
        }
    } else if (err == ESP_ERR_INVALID_SIZE) {
        ESP_LOGE(TAG, "telemetry exceeds one ESP-NOW frame: device_id has %u chars, keep it <= 30 (README, Hợp đồng)",
                 (unsigned)strlen(s_cfg.device_id));
        s_next_send_us = now_us + TELEMETRY_INTERVAL_US;
    } else {
        /* Không ack tầng MAC: thử lại sau 1 s; node_link tự dò lại kênh sau vài lần lỗi liên tiếp. */
        ESP_LOGW(TAG, "telemetry not sent: %s", esp_err_to_name(err));
        if (changed) {
            ESP_LOGW(CMD_TAG, "[4] state NOT delivered to gateway (%s), retry in 1 s", esp_err_to_name(err));
        }
        s_next_send_us = now_us + TELEMETRY_RETRY_US;
    }
}

/* Gói MÃ IR: số đo + điều hòa + ac_codes (bitmask mã đã học — web vẽ lưới 16 ô theo nó). Khi đổi + 10 phút/lần. */
static void send_codes(int64_t now_us, uint32_t codes)
{
    node_metric_t m[MAX_METRICS];
    size_t n = add_climate(m, 0, now_us);
    n = add_ac(m, n);
    m[n++] = (node_metric_t){.key = "ac_codes", .value = (float)codes, .decimals = 0};
    esp_err_t err = node_telemetry_send(&s_cfg, m, n);
    if (err == ESP_OK) {
        s_codes_sent = true;
        s_codes_last = codes;
        s_codes_next_us = now_us + AC_CODES_RESYNC_US;
        s_next_send_us = now_us + TELEMETRY_INTERVAL_US;   /* gói này đã mang số đo của chu kỳ */
        ESP_LOGI(TAG, "telemetry sent to gateway (%u fields, learned AC codes 0x%04x)", (unsigned)n, (unsigned)codes);
    } else {
        ESP_LOGW(TAG, "AC codes not sent: %s", esp_err_to_name(err));
        s_codes_retry_us = now_us + (err == ESP_ERR_INVALID_SIZE ? AC_CODES_RESYNC_US : TELEMETRY_RETRY_US);
    }
}

/* Mỗi vòng gửi tối đa 1 gói, chỉ khi đã nối Gateway và có giờ từ TIME_SYNC (để ký HMAC). */
static void report_tick(void)
{
    if (!s_paired || !node_link_is_online() || !node_time_is_synced()) {
        return;   /* cờ "đã đổi" giữ nguyên tới khi gửi được */
    }
    int64_t now = esp_timer_get_time();
    /* Tải vừa đổi (màn hình / lệnh Server / khôi phục lúc khởi động): gửi ngay. Gọi đủ 3 hàm để xoá cả 3 cờ. */
    bool changed = node_ac_take_changed();
    changed = node_switches_take_changed() || changed;
    changed = node_curtain_take_changed() || changed;
    if (changed) {
        s_next_send_us = now;
        s_state_dirty = true;
    }
    if (now >= s_next_send_us) {
        send_state(now, s_state_dirty);
        return;
    }
    uint32_t codes;
    if (node_ac_get_codes(&codes) && now >= s_codes_retry_us &&
        (!s_codes_sent || codes != s_codes_last || now >= s_codes_next_us)) {
        send_codes(now, codes);
    }
}

static void report_task(void *arg)
{
    (void)arg;
    for (;;) {
        refresh_link_ui();
        refresh_led();
        report_tick();
        vTaskDelay(pdMS_TO_TICKS(REPORT_PERIOD_MS));
    }
}

/* ---- cảm biến ----------------------------------------------------------------------------------------- */

static void climate_task(void *arg)
{
    (void)arg;
    bool reported_missing = false;
    unsigned fails = 0;
    unsigned reads = 0;
    for (;;) {
        if (!board_sensors_climate_ready()) {
            esp_err_t err = board_sensors_init();
            if (err != ESP_OK) {
                if (!reported_missing) {
                    reported_missing = true;
                    ESP_LOGW(TAG, "SHT3x not found at 0x44/0x45 (%s): check SDA/SCL/3V3/GND, retrying every %d s",
                             esp_err_to_name(err), CLIMATE_FIND_RETRY_MS / 1000);
                    node_ui_set_climate(false, 0, 0);
                    atomic_store(&s_climate_fault, true);
                }
                vTaskDelay(pdMS_TO_TICKS(CLIMATE_FIND_RETRY_MS));
                continue;
            }
        }

        float temperature = 0;
        float humidity = 0;
        esp_err_t err = board_sensors_read_climate(&temperature, &humidity);
        if (err == ESP_OK) {
            if (fails >= CLIMATE_MAX_FAILS) {
                ESP_LOGI(TAG, "SHT3x readings back");
            }
            fails = 0;
            atomic_store(&s_climate_fault, false);
            taskENTER_CRITICAL(&s_climate_mux);
            s_temperature = temperature;
            s_humidity = humidity;
            s_climate_us = esp_timer_get_time();
            taskEXIT_CRITICAL(&s_climate_mux);
            node_ui_set_climate(true, temperature, humidity);
            if (reads++ % CLIMATE_LOG_EVERY == 0) {
                ESP_LOGI(TAG, "SHT3x: %.1f C, %.1f %%RH", temperature, humidity);
            }
        } else if (++fails == CLIMATE_MAX_FAILS) {
            ESP_LOGW(TAG, "SHT3x read failed %u times in a row (%s): check wiring", fails, esp_err_to_name(err));
            node_ui_set_climate(false, 0, 0);
            atomic_store(&s_climate_fault, true);
        }
        vTaskDelay(pdMS_TO_TICKS(CLIMATE_PERIOD_MS));
    }
}

/* ---- khởi động ---------------------------------------------------------------------------------------- */

static void start_display(void)
{
    esp_err_t err = board_display_init();
    if (err != ESP_OK) {
        /* Vẫn chạy cảm biến + ESP-NOW + tải: điều khiển được từ Server, số đo xem được trên Gateway. */
        ESP_LOGE(TAG, "display init failed: %s — kiểm dây và chân trong menuconfig", esp_err_to_name(err));
        return;
    }
    err = node_ui_start();
    if (err != ESP_OK) {
        ESP_LOGE(TAG, "UI start failed: %s", esp_err_to_name(err));
    }
    /* Bật đèn nền sau khi đã có màn hình đầu: tránh nháy nội dung rác của RAM màn hình. */
    err = board_display_backlight_on();
    if (err != ESP_OK && err != ESP_ERR_NOT_SUPPORTED) {
        ESP_LOGW(TAG, "backlight: %s", esp_err_to_name(err));
    }
    ESP_LOGI(TAG, "display up (touch %s)", board_display_touch_enabled() ? "on" : "off");
}

/* Đèn, quạt, rèm: chạy cả khi chưa ghép nối Gateway (điều khiển tại chỗ trên màn hình). */
static void start_loads(void)
{
    esp_err_t err = node_switches_start();
    if (err == ESP_ERR_NOT_SUPPORTED) {
        ESP_LOGI(TAG, "lamp/fan relays disabled in menuconfig");
    } else if (err != ESP_OK) {
        atomic_store(&s_load_fault, true);
    }
    err = node_curtain_start();
    if (err == ESP_ERR_NOT_SUPPORTED) {
        ESP_LOGI(TAG, "curtain motor disabled in menuconfig");
    } else if (err != ESP_OK) {
        atomic_store(&s_load_fault, true);
    }
}

static void start_audio(void)
{
    esp_err_t err = node_audio_start();
    if (err == ESP_ERR_NOT_SUPPORTED) {
        ESP_LOGI(TAG, "mic/speaker disabled in menuconfig (Node S3: âm thanh)");
    } else if (err != ESP_OK) {
        ESP_LOGW(TAG, "audio not started: %s", esp_err_to_name(err));
    }
}

esp_err_t node_app_start(void)
{
    setenv("TZ", LOCAL_TZ, 1);
    tzset();

    node_status_led_start();   /* xanh dương = đang khởi động; không cần NVS */

    /* NVS: KHÔNG tự xoá khi lỗi (mất identity + ghép nối) — báo để nạp lại ảnh NVS, như Gateway. */
    esp_err_t nvs_err = nvs_flash_init();
    start_display();
    if (nvs_err == ESP_OK) {
        start_link();
        node_ac_start();   /* mã IR nằm trong NVS; điều khiển tại chỗ chạy được cả khi chưa ghép nối Gateway */
    } else {
        ESP_LOGE(TAG, "nvs_flash_init: %s — re-flash the NVS image (README, Ghép nối Gateway)",
                 esp_err_to_name(nvs_err));
    }
    start_loads();   /* NVS lỗi thì không khôi phục được trạng thái cũ, nhưng vẫn điều khiển được */
    start_audio();

    if (xTaskCreate(climate_task, "climate", CLIMATE_TASK_STACK, NULL, CLIMATE_TASK_PRIO, NULL) != pdPASS ||
        xTaskCreate(report_task, "report", REPORT_TASK_STACK, NULL, REPORT_TASK_PRIO, NULL) != pdPASS) {
        ESP_LOGE(TAG, "cannot start climate/report task (no memory)");
        return ESP_ERR_NO_MEM;
    }
    return ESP_OK;
}
