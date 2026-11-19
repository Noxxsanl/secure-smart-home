/*
 * Node phòng khách ESP32-S3 — điểm vào. Toàn bộ luồng ở components/application (node_app), như Gateway:
 * màn hình + SHT31 + ESP-NOW tới Gateway + điều hòa IR + đèn/quạt (relay) + rèm (động cơ bước) + LED trạng thái
 * (+ mic/loa, mặc định tắt). Chân chỉnh trong menuconfig → các menu "Node S3: ...".
 */
#include "esp_log.h"
#include "node_app.h"

void app_main(void)
{
    esp_err_t err = node_app_start();
    if (err != ESP_OK) {
        ESP_LOGE("app_main", "node_app_start: %s", esp_err_to_name(err));
    }
}
