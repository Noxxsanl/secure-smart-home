# Sensor Node Firmware – ESP32

Firmware cho ESP32 DOIT DevKit v1 đóng vai trò **Sensor Node** trong hệ thống IoT: đọc nhiệt độ/độ ẩm từ DHT22, ký HMAC-SHA256, rồi publish lên MQTT broker (Gateway).

---

## Kiến trúc hệ thống

```
DHT22 ──► ESP32 (Sensor Node)
               │  MQTT over WiFi
               ▼
          Gateway Node ──► Backend API ──► Database
```

---

## Cấu trúc project

```
sensor-node/
├── platformio.ini          # Cấu hình build PlatformIO
├── include/
│   └── config.h            # Cấu hình thiết bị (WiFi, MQTT, PIN...)
├── lib/
│   ├── wifi_manager/       # Kết nối và tự reconnect WiFi
│   ├── ntp_sync/           # Đồng bộ thời gian NTP (UTC+7)
│   ├── sensor_reader/      # Đọc dữ liệu từ DHT22
│   ├── hmac_util/          # Tính HMAC-SHA256 (mbedtls)
│   └── mqtt_sender/        # Build JSON payload và publish MQTT
└── src/
    └── main.cpp            # Entry point: setup() và loop()
```

---

## Phần cứng

| Thành phần       | Kết nối              | Ghi chú                          |
|------------------|----------------------|----------------------------------|
| DHT22 – VCC      | 3.3V                 |                                  |
| DHT22 – GND      | GND                  |                                  |
| DHT22 – DATA     | GPIO 4               | Pull-up 10kΩ lên 3.3V            |
| LED WiFi (xanh)  | GPIO 0               | **BOOT pin** – không kéo xuống GND lúc boot |
| LED Gửi (đỏ)     | GPIO 2               | Onboard LED                      |

---

## Cài đặt

### 1. Yêu cầu

- [PlatformIO](https://platformio.org/) (VSCode Extension hoặc CLI)
- ESP32 DOIT DevKit v1

### 2. Đăng ký thiết bị

Đăng ký trên Dashboard web hoặc gọi trực tiếp API (cần JWT token):

```http
POST /api/devices/register
Content-Type: application/json
Cookie: token=<JWT>

{
  "device_name": "Sensor phòng khách",
  "device_type": "sensor"
}
```

Response (201):
```json
{
  "success": true,
  "device": {
    "device_id": "ESP32-SN-ABCD1234",
    "device_name": "Sensor phòng khách",
    "device_type": "sensor",
    "status": "inactive",
    "secret_key": "64-char-hex-string..."
  }
}
```

> `secret_key` chỉ trả về **một lần duy nhất**. Sao chép và lưu ngay.
> Sau khi flash firmware, cần **kích hoạt** thiết bị (đổi status → `active`) trên Dashboard.

### 3. Cấu hình `include/config.h`

```cpp
#define DEVICE_ID   "ESP32-SN-ABCD1234"           // từ API đăng ký
#define SECRET_KEY  "64-char-hex-secret-key"       // từ API đăng ký

#define WIFI_SSID   "ten-wifi"
#define WIFI_PASS   "mat-khau-wifi"

#define MQTT_HOST   "192.168.1.100"                // IP Gateway hoặc broker
#define MQTT_PORT   1883
```

### 4. Build & Upload

```bash
# Build
pio run

# Upload lên ESP32
pio run --target upload

# Xem Serial Monitor
pio device monitor
```

---

## Hoạt động

### Khởi động (`setup`)

```
Serial (115200) ──► WiFi ──► NTP sync ──► DHT22 init ──► MQTT setup
```

### Vòng lặp chính (`loop`) – mỗi 5 giây

```
wifiMaintain() + mqttMaintain()
        │
        ▼ (nếu WiFi + NTP + MQTT sẵn sàng)
    readSensor()
        │
        ▼ (nếu dữ liệu hợp lệ)
    mqttPublishSensorData()
        │
        ▼ (nếu publish thành công)
    Nháy LED GPIO 2 (100ms)
```

---

## MQTT Payload

**Topic:** `local/sensors/<DEVICE_ID>/data`

```json
{
  "sensor_id":    "ESP32-SN-ABCD1234",
  "sn_timestamp": 1700000000,
  "sn_hmac":      "a3f1c2...64 ký tự...",
  "data": {
    "temperature": 28.5,
    "humidity":    65.2
  }
}
```

**HMAC được tính như sau:**
```
message = "<sensor_id>:<sn_timestamp>"
hmac    = HMAC-SHA256(SECRET_KEY, message)
```

Backend xác thực bằng cách tính lại HMAC với secret key của thiết bị và so sánh.

---

## Serial Monitor – Output mẫu

```
╔══════════════════════════════════╗
║   IoT Sensor Node – Khởi động    ║
╚══════════════════════════════════╝
  Device ID  : ESP32-SN-ABCD1234
  DHT22 Pin  : GPIO 4
  Gửi mỗi   : 5000 ms

[WiFi] Connecting to 'MyWiFi'......... OK – IP: 192.168.1.42
[NTP] Syncing..... OK – 2024-12-20 15:30:45 (UTC+7)
[DHT] DHT22 khởi tạo trên GPIO 4
[MQTT] Broker: 192.168.1.100:1883
[MAIN] Setup hoàn tất – vào vòng lặp chính

[MQTT] Kết nối với id='sn-ESP32-SN-ABCD1234'... OK
[DHT] Nhiệt độ: 28.5°C | Độ ẩm: 65.2%
[MQTT] Published (142 bytes): {"sensor_id":"ESP32-SN-ABCD1234",...}
```

---

## Thư viện sử dụng

| Thư viện                    | Phiên bản | Mục đích              |
|-----------------------------|-----------|-----------------------|
| knolleary/PubSubClient      | ^2.8      | MQTT client           |
| adafruit/DHT sensor library | ^1.4.4    | Đọc DHT22             |
| adafruit/Adafruit Unified Sensor | ^1.1.9 | Abstraction layer     |
| bblanchon/ArduinoJson       | ^6.21.5   | Serialize JSON payload |
| mbedtls                     | built-in  | HMAC-SHA256 (ESP32)   |
