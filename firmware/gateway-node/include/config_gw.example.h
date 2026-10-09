// Mẫu cấu hình Gateway — sao chép thành config_gw.h (gitignored) rồi điền giá trị thật:
//   cp include/config_gw.example.h include/config_gw.h
// CI dùng nguyên file này để build, nên mọi macro firmware cần phải có ở đây.
// Không bao giờ ghi WiFi password hay secret thật vào file mẫu.
#pragma once

// 1. Identity — lấy từ API đăng ký thiết bị (secret chỉ trả 1 lần)
#define GW_DEVICE_ID  "ESP32-GW-XXXXXXXX"
#define GW_SECRET_KEY "0000000000000000000000000000000000000000000000000000000000000000"

// 2. WiFi (chỉ 2.4 GHz)
#define WIFI_SSID "your-ssid"
#define WIFI_PASS "your-password"
#define WIFI_RECONNECT_INTERVAL_MS 10000

// 3. MQTT — Broker 1 (sensor → gateway, plaintext), Broker 2 (gateway → backend, TLS)
#define MQTT_BROKER1_HOST "192.168.1.100"
#define MQTT_BROKER1_PORT 1883
#define MQTT_BROKER2_HOST "192.168.1.100"  // phải nằm trong SAN cert (scripts/gen_mqtt_certs.sh)
#define MQTT_BROKER2_PORT 8883
#define MQTT_BUFFER_SIZE 1024
#define MQTT_RECONNECT_INTERVAL_MS 5000
#define GATEWAY_DATA_TOPIC "gateway/" GW_DEVICE_ID "/data"

// 4. Danh sách sensor từ backend (qua Nginx cổng 80)
#define BACKEND_SENSORS_URL "http://192.168.1.100/api/device/sensors"
#define HTTP_TIMEOUT 5000
#define SENSOR_REGISTRY_MAX 16
#define SENSOR_REGISTRY_TTL_MS 300000UL  // 5 phút

// 5. Kiểm tra payload sensor: lệch thời gian tối đa ±giây
#define TIMESTAMP_WINDOW_SEC 300

// 6. LED trạng thái
#define LED_WIFI_PIN 2
#define LED_FWD_PIN 4

// 7. Danh sách sensor cục bộ (dự phòng khi chưa lấy được từ backend)
struct SensorCredential {
    const char* device_id;
    const char* secret_key;
};

static const SensorCredential KNOWN_SENSORS[] = {
    { "ESP32-SN-XXXXXXXX", "0000000000000000000000000000000000000000000000000000000000000000" },
};
#define KNOWN_SENSOR_COUNT ((int)(sizeof(KNOWN_SENSORS) / sizeof(KNOWN_SENSORS[0])))
