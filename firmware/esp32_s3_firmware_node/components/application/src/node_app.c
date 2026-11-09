#include "node_app.h"

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
#include "node_config.h"
#include "node_link.h"
#include "node_telemetry.h"
#include "node_time.h"
#include "node_ui.h"
#include "nvs_flash.h"
#include "sdkconfig.h"

static const char *TAG = "node_app";

#define LOCAL_TZ "<+07>-7"   /* như Gateway: giờ Việt Nam cho màn hình; giờ hệ thống và HMAC vẫn là UTC */

#define CLIMATE_PERIOD_MS 2000
#define CLIMATE_FIND_RETRY_MS 5000   /* chưa thấy cảm biến: tìm lại (cắm dây sau khi khởi động vẫn nhận) */
#define CLIMATE_MAX_FAILS 3          /* đọc lỗi liên tiếp bấy nhiêu lần thì báo lỗi lên màn hình */
#define CLIMATE_LOG_EVERY 5          /* log 1 trong 5 lần đọc (10 s/lần) */
#define CLIMATE_TASK_STACK 4096
#define CLIMATE_TASK_PRIO 3
#define TELEMETRY_INTERVAL_US ((int64_t)CONFIG_NODE_APP_TELEMETRY_INTERVAL_S * 1000 * 1000)

/* Đọc sau node_app_start; secret giữ trong RAM suốt đời chạy để ký telemetry (không log — bất biến 2). */
static node_config_t s_cfg;
static bool s_paired;   /* node_link đã chạy (có identity + MAC Gateway + LMK) */

/* Chỉ task climate truy cập. */
static int64_t s_next_send_us;
static int64_t s_last_sent_ts;

/* ---- ESP-NOW ------------------------------------------------------------------------------------------ */

/* Node chưa có relay/IR (chờ chốt GPIO): trả lỗi ngay để Gateway không phải chờ hết 3 s. */
static void on_cmd(const char *command_id, const char *action, const cJSON *params, void *ctx)
{
    (void)params;
    (void)ctx;
    ESP_LOGW(TAG, "CMD %s action=%s: no actuator wired yet, replying error", command_id, action);
    node_link_send_cmd_ack(command_id, false, NODE_POWER_UNKNOWN);
}

/* Chạy trong task node_link: chỉ log; màn hình do task climate cập nhật (refresh_link_ui). */
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

/* Cập nhật góc phải màn hình khi trạng thái đổi (gọi mỗi vòng của task climate). */
static void refresh_link_ui(void)
{
    static bool shown;
    static node_ui_link_t last_link;
    static int64_t last_sent;

    node_ui_link_t link = !s_paired               ? NODE_UI_LINK_UNPAIRED
                          : node_link_is_online() ? NODE_UI_LINK_ONLINE
                                                  : NODE_UI_LINK_SEARCHING;
    if (shown && link == last_link && s_last_sent_ts == last_sent) {
        return;
    }
    shown = true;
    last_link = link;
    last_sent = s_last_sent_ts;
    node_ui_set_link(link, s_last_sent_ts);
}

/* Gửi TELEMETRY khi tới hạn và đủ điều kiện (đã nối Gateway, có giờ từ TIME_SYNC để ký HMAC). */
static void maybe_send(float temperature, float humidity)
{
    int64_t now_us = esp_timer_get_time();
    if (!s_paired || !node_link_is_online() || !node_time_is_synced() || now_us < s_next_send_us) {
        return;
    }
    const node_metric_t metrics[] = {
        {.key = "temperature", .value = temperature, .decimals = 1},
        {.key = "humidity", .value = humidity, .decimals = 1},
    };
    esp_err_t err = node_telemetry_send(&s_cfg, metrics, sizeof(metrics) / sizeof(metrics[0]));
    if (err == ESP_OK) {
        s_next_send_us = now_us + TELEMETRY_INTERVAL_US;
        node_time_now(&s_last_sent_ts);
        ESP_LOGI(TAG, "telemetry sent to gateway: %.1f C, %.1f %%RH", temperature, humidity);
    } else {
        /* Không ack tầng MAC: thử lại ở lần đọc sau; node_link tự dò lại kênh sau vài lần lỗi liên tiếp. */
        ESP_LOGW(TAG, "telemetry not sent: %s", esp_err_to_name(err));
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
        refresh_link_ui();
        if (!board_sensors_climate_ready()) {
            esp_err_t err = board_sensors_init();
            if (err != ESP_OK) {
                if (!reported_missing) {
                    reported_missing = true;
                    ESP_LOGW(TAG, "SHT3x not found at 0x44/0x45 (%s): check SDA/SCL/3V3/GND, retrying every %d s",
                             esp_err_to_name(err), CLIMATE_FIND_RETRY_MS / 1000);
                    node_ui_set_climate(false, 0, 0);
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
            node_ui_set_climate(true, temperature, humidity);
            if (reads++ % CLIMATE_LOG_EVERY == 0) {
                ESP_LOGI(TAG, "SHT3x: %.1f C, %.1f %%RH", temperature, humidity);
            }
            maybe_send(temperature, humidity);
        } else if (++fails == CLIMATE_MAX_FAILS) {
            ESP_LOGW(TAG, "SHT3x read failed %u times in a row (%s): check wiring", fails, esp_err_to_name(err));
            node_ui_set_climate(false, 0, 0);
        }
        vTaskDelay(pdMS_TO_TICKS(CLIMATE_PERIOD_MS));
    }
}

/* ---- khởi động ---------------------------------------------------------------------------------------- */

static void start_display(void)
{
    esp_err_t err = board_display_init();
    if (err != ESP_OK) {
        /* Vẫn chạy cảm biến + ESP-NOW: số đo xem được trong log và trên Gateway khi màn hình lỗi. */
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

esp_err_t node_app_start(void)
{
    setenv("TZ", LOCAL_TZ, 1);
    tzset();

    /* NVS: KHÔNG tự xoá khi lỗi (mất identity + ghép nối) — báo để nạp lại ảnh NVS, như Gateway. */
    esp_err_t nvs_err = nvs_flash_init();
    start_display();
    if (nvs_err == ESP_OK) {
        start_link();
    } else {
        ESP_LOGE(TAG, "nvs_flash_init: %s — re-flash the NVS image (README, Ghép nối Gateway)",
                 esp_err_to_name(nvs_err));
    }

    if (xTaskCreate(climate_task, "climate", CLIMATE_TASK_STACK, NULL, CLIMATE_TASK_PRIO, NULL) != pdPASS) {
        ESP_LOGE(TAG, "cannot start climate task (no memory)");
        return ESP_ERR_NO_MEM;
    }
    return ESP_OK;
}
