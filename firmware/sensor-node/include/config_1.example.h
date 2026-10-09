// Mẫu cấu hình Sensor Node 1 — sao chép thành config_1.h (gitignored) rồi điền giá trị thật:
//   cp include/config_1.example.h include/config_1.h
// CI dùng nguyên file này để build, nên mọi macro firmware cần phải có ở đây.
// Không bao giờ ghi WiFi password hay secret thật vào file mẫu.
#pragma once

// 1. Identity — lấy từ API đăng ký thiết bị (secret chỉ trả 1 lần)
#define DEVICE_ID  "ESP32-SN-XXXXXXXX"
#define SECRET_KEY "0000000000000000000000000000000000000000000000000000000000000000"

// 2. WiFi (chỉ 2.4 GHz)
#define WIFI_SSID "your-ssid"
#define WIFI_PASS "your-password"

// 3. MQTT Broker 1 (plaintext, gateway subscribe local/sensors/+/data)
#define MQTT_HOST "192.168.1.100"
#define MQTT_PORT 1883
#define MQTT_BUFFER_SIZE 512

// 4. Phần cứng
#define DHT_PIN      4
#define DHT_TYPE     DHT22
#define LED_WIFI_PIN 2
#define LED_SEND_PIN 5

// 5. Chu kỳ gửi (ms)
#define SEND_INTERVAL 10000
