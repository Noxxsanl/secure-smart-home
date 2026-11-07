/*
 * Thiết kế: docs/firmware/IOT_NODE_NETWORK.md §4.2, §5.2, §5.4, §6.2; hợp đồng: docs/API_DESIGN.md §10.2, §10.3, §11.
 * Hiện trạng và việc còn thiếu: firmware/esp32_cam/README.md.
 */
#include "cam_app.h"

#include <string.h>

#include "cam_camera.h"
#include "cam_config.h"
#include "cam_espnow.h"
#include "cam_pir.h"
#include "cam_snapshot.h"
#include "cam_stream.h"
#include "cam_time.h"
#include "cam_wifi.h"
#include "esp_app_desc.h"
#include "esp_event.h"
#include "esp_log.h"
#include "esp_netif.h"
#include "esp_ota_ops.h"
#include "nvs_flash.h"
#include "sdkconfig.h"

static const char *TAG = "cam_app";

/* Sống suốt chương trình — các service giữ con trỏ tới đây. */
static cam_config_t s_cfg;

static void on_motion(void)
{
    int64_t ts;
    if (cam_espnow_ready() && cam_time_now(&ts)) {
        cam_espnow_send_event("motion", ts);
    }
    cam_snapshot_request(CAM_TRIGGER_MOTION, NULL);
}

static void on_command(const char *command_id, const char *action)
{
    if (strcmp(action, "snapshot") == 0) {
        if (!cam_snapshot_request(CAM_TRIGGER_REQUEST, command_id)) {
            cam_espnow_send_cmd_ack(command_id, false);
        }
        return;   /* CMD_ACK gửi sau khi ảnh tới Gateway (on_snapshot_done) */
    }
    /* live_start / live_stop do Gateway tự xử lý bằng cách mở/đóng GET /stream. */
    ESP_LOGW(TAG, "unsupported action \"%s\"", action);
    cam_espnow_send_cmd_ack(command_id, false);
}

static void on_snapshot_done(const char *command_id, bool ok)
{
    cam_espnow_send_cmd_ack(command_id, ok);
}

static esp_err_t init_nvs(void)
{
    esp_err_t err = nvs_flash_init();
    if (err == ESP_ERR_NVS_NO_FREE_PAGES || err == ESP_ERR_NVS_NEW_VERSION_FOUND) {
        /* Xoá NVS là mất identity/secret → không tự xoá, báo để nạp lại. */
        ESP_LOGE(TAG, "NVS partition unusable (%s) — reflash nvs_dev.bin (README)", esp_err_to_name(err));
    }
    return err;
}

esp_err_t cam_app_start(void)
{
    ESP_LOGI(TAG, "ESP32-CAM firmware %s", esp_app_get_description()->version);

    esp_err_t err = init_nvs();
    if (err != ESP_OK) {
        return err;
    }
    err = cam_config_load(&s_cfg);
    if (err != ESP_OK) {
        /* TODO: chế độ chờ ghép nối (PAIR_REQUEST) thay vì dừng. */
        ESP_LOGE(TAG, "not provisioned: load identity + wifi into NVS (README, nvs_dev.csv)");
        return err;
    }

    /* drivers — camera trước PIR: driver camera cài GPIO ISR service với cờ của nó. */
    err = cam_camera_init(CONFIG_CAM_SNAPSHOT_JPEG_QUALITY);
    if (err != ESP_OK) {
        ESP_LOGE(TAG, "camera unavailable — check ribbon cable and 5 V supply");
        return err;
    }

    /* services */
    ESP_ERROR_CHECK(esp_netif_init());
    ESP_ERROR_CHECK(esp_event_loop_create_default());
    cam_time_init();
    ESP_ERROR_CHECK(cam_wifi_start(s_cfg.wifi_ssid, s_cfg.wifi_password));
    memset(s_cfg.wifi_password, 0, sizeof(s_cfg.wifi_password));   /* driver WiFi đã giữ bản của nó */

    if (cam_espnow_start(&s_cfg, on_command) != ESP_OK) {
        ESP_LOGW(TAG, "running without ESP-NOW: no time sync, events or commands from gateway");
    }
    memset(s_cfg.lmk, 0, sizeof(s_cfg.lmk));   /* đã nạp vào peer ESP-NOW */

    ESP_ERROR_CHECK(cam_snapshot_start(&s_cfg, on_snapshot_done));
    ESP_ERROR_CHECK(cam_stream_start(&s_cfg));
    ESP_ERROR_CHECK(cam_pir_start(on_motion));

    /* Khởi tạo đủ thì xác nhận bản firmware này, để bootloader không rollback (CONFIG_BOOTLOADER_APP_ROLLBACK_ENABLE). */
    esp_ota_mark_app_valid_cancel_rollback();
    ESP_LOGI(TAG, "ready");
    return ESP_OK;
}
