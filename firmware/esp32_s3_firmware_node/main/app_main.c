/*
 * Node phòng khách ESP32-S3 — điểm vào.
 *
 * CHƯA nối thư viện: chờ chốt sơ đồ chân GPIO (README, mục "Khi chốt GPIO").
 * Thư viện đã có trong components/drivers (phần cứng) và components/services (NVS, đồng hồ, ESP-NOW,
 * telemetry có HMAC, kho mã IR).
 */
#include "esp_log.h"

static const char *TAG = "app_main";

void app_main(void)
{
    ESP_LOGI(TAG, "libraries built; GPIO map not decided yet — nothing started");
}
