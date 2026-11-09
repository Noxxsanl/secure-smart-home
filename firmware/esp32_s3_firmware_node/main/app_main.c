/*
 * Node phòng khách ESP32-S3 — điểm vào. Toàn bộ luồng ở components/application (node_app), như Gateway:
 * màn hình + SHT31 + ESP-NOW tới Gateway. Chân chỉnh trong menuconfig → "Node S3: màn hình" / "Node S3: cảm biến I2C".
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
