/*
 * Node phòng khách ESP32-S3 — điểm vào.
 *
 * Hiện mới bật MÀN HÌNH: TFT 3.5" ILI9488 + cảm ứng XPT2046 + LVGL 8.4 (components/board, components/ui), chân
 * chỉnh trong menuconfig → "Node S3: màn hình". Cảm biến, relay, IR, âm thanh, ESP-NOW chờ chốt sơ đồ chân
 * (README, mục "Khi chốt GPIO"); khi đó phần khởi động chuyển sang components/application như Gateway.
 */
#include "board_display.h"
#include "esp_err.h"
#include "esp_log.h"
#include "node_ui.h"

static const char *TAG = "app_main";

void app_main(void)
{
    esp_err_t err = board_display_init();
    if (err != ESP_OK) {
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
    ESP_LOGI(TAG, "display up (touch %s); sensors/relay/ESP-NOW wait for the GPIO map",
             board_display_touch_enabled() ? "on" : "off");
}
