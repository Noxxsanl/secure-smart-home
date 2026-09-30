# Gateway Node Firmware

Firmware cho **ESP32 DOIT DevKit V1** hoạt động như một IoT Gateway: nhận dữ liệu từ các Sensor Node qua MQTT nội bộ, xác thực HMAC, rồi publish lên Backend qua **MQTT over TLS**.

---

## Kiến trúc tổng quan

```
Sensor Node (ESP32 DOIT V1)
      │  MQTT Publish
      │  topic: local/sensors/{sensor_id}/data
      ▼
 MQTT Broker (Mosquitto – LAN :1883)
      │  Subscribe: local/sensors/+/data
      ▼
 Gateway Node (ESP32 DOIT V1)           ← firmware này
      │  1. Validate: whitelist + timestamp ±300s + HMAC
      │  2. Re-sign: Gateway HMAC
      │  MQTT Publish qua TLS (verify cert broker bằng CA nội bộ)
      │  topic: gateway/{gateway_id}/data
      ▼
 MQTT Broker 2 (Mosquitto – TLS :8883)
      │  Backend Subscribe (TLS): gateway/+/data
      ▼
 Backend API (Express.js :5000)
```

> Gateway còn gọi HTTP GET `/api/device/sensors` mỗi 5 phút để lấy danh sách sensor active từ Backend (dynamic whitelist).

---

## Phần cứng

| Thành phần | Thông số |
|---|---|
| Board | ESP32 WROOM-32 (DOIT DevKit V1, 30-pin) |
| Kết nối máy tính | Cáp Micro-USB có data |
| LED WiFi | GPIO 14 – xanh lá (220 Ω lên 3.3 V) |
| LED Forward | GPIO 15 – vàng (220 Ω lên 3.3 V) |

> **Lưu ý GPIO ESP32 DOIT V1:**
> - GPIO 0 – nút BOOT (strapping pin), không dùng làm output
> - GPIO 14, 15 là chân an toàn để gắn LED ngoài

---

## Cấu trúc project

```
gateway-node/
├── include/
│   ├── config_gw.h          # Cấu hình tập trung (WiFi, MQTT, secrets, sensor whitelist) — gitignored
│   └── mqtt_ca_cert.h       # CA của Broker 2, sinh bằng scripts/gen_mqtt_certs.sh — gitignored
├── lib/
│   ├── hmac_util/            # HMAC-SHA256 dùng mbedTLS tích hợp của ESP-IDF
│   ├── wifi_manager/         # Kết nối và auto-reconnect WiFi
│   ├── ntp_sync/             # Đồng bộ thời gian NTP (UTC+7)
│   ├── mqtt_client/          # MQTT: Broker 1 (subscribe) + Broker 2 (publish qua TLS), auto-reconnect
│   ├── forwarder/            # Validate payload, ký Gateway HMAC, MQTT Publish
│   └── sensor_registry/      # Quản lý danh sách sensor (static + dynamic fetch)
├── src/
│   └── main.cpp              # Entry point (setup / loop)
└── platformio.ini
```

---

## Cấu hình trước khi nạp firmware

Mở [`include/config_gw.h`](include/config_gw.h) và điền đầy đủ các giá trị:

```cpp
// 1. Identity — lấy từ API đăng ký thiết bị (/api/devices/register)
#define GW_DEVICE_ID  "ESP32-GW-XXXXXXXX"
#define GW_SECRET_KEY "your-64-char-hex-secret"

// 2. WiFi (chỉ 2.4 GHz)
#define WIFI_SSID "your-ssid"
#define WIFI_PASS "your-password"

// 3. MQTT Broker (IP máy chạy Mosquitto)
#define MQTT_BROKER1_HOST "192.168.1.100"   // Sensor → Gateway, plaintext
#define MQTT_BROKER1_PORT 1883
#define MQTT_BROKER2_HOST "192.168.1.100"   // Gateway → Backend, TLS — phải nằm trong SAN của cert
#define MQTT_BROKER2_PORT 8883

// 4. URL lấy danh sách sensor từ Backend (qua Nginx cổng 80)
#define BACKEND_SENSORS_URL "http://192.168.1.100/api/device/sensors"

// 5. Danh sách sensor cục bộ (backup — Gateway tự cập nhật từ backend)
static const SensorCredential KNOWN_SENSORS[] = {
    { "ESP32-SN-XXXXXXXX", "sensor-64-char-hex-secret" },
};
```

### Chứng chỉ TLS cho Broker 2

Gateway chỉ kết nối Broker 2 qua TLS và kiểm chứng chứng chỉ broker bằng CA nội bộ (không có chế độ bỏ qua kiểm tra). Từ thư mục gốc repo:

```bash
bash scripts/gen_mqtt_certs.sh 192.168.1.100   # đúng giá trị MQTT_BROKER2_HOST
```

Script sinh `include/mqtt_ca_cert.h`. Thiếu file này thì build báo lỗi. IP/hostname truyền vào phải trùng `MQTT_BROKER2_HOST`, nếu không gateway sẽ từ chối kết nối (`X509 - Certificate verification failed`). Đổi IP thì chạy lại script: CA giữ nguyên nên không phải nạp lại firmware.

---

## Quy trình xác thực payload

Mỗi message MQTT từ Sensor Node đi qua pipeline 5 bước trước khi được forward:

```
Nhận MQTT payload (local/sensors/{id}/data)
      │
      ├─ 1. Parse JSON  →  thiếu field  → DROP
      ├─ 2. Whitelist   →  sensor lạ    → REJECT
      ├─ 3. Timestamp   →  ngoài ±300s  → REJECT
      └─ 4. Sensor HMAC →  sai hash     → REJECT
                │
                ▼ PASS
      Tính Gateway HMAC
      Build output JSON
      MQTT Publish → gateway/{gw_id}/data
```

**Sensor payload (MQTT input — topic: `local/sensors/{id}/data`):**
```json
{
  "sensor_id":    "ESP32-SN-XXXXXXXX",
  "sn_timestamp": 1717200000,
  "sn_hmac":      "64-char-hex",
  "data": { "temperature": 28.5, "humidity": 65.2 }
}
```

**Forwarded payload (MQTT output — topic: `gateway/{gw_id}/data`):**
```json
{
  "gateway_id":   "ESP32-GW-XXXXXXXX",
  "gw_timestamp": 1717200001,
  "gw_hmac":      "64-char-hex",
  "gateway_ip":   "192.168.1.42",
  "sensor_payload": {
    "sensor_id":    "ESP32-SN-XXXXXXXX",
    "sn_timestamp": 1717200000,
    "sn_hmac":      "64-char-hex",
    "data": { "temperature": 28.5, "humidity": 65.2 }
  }
}
```

**Thuật toán HMAC:**
```
sensor_hmac  = HMAC-SHA256(sensor_secret,  "sensor_id:sn_timestamp")
gateway_hmac = HMAC-SHA256(gateway_secret, "gateway_id:gw_timestamp")
```

---

## Build & Flash

**Yêu cầu:** [PlatformIO](https://platformio.org/) (CLI hoặc VS Code extension)

```bash
# Build
pio run

# Flash + monitor
pio run --target upload && pio device monitor --baud 115200

# Chỉ monitor
pio device monitor --baud 115200
```

**Flash thất bại (chế độ BOOT thủ công cho ESP32 DOIT V1):**
1. Giữ nút **BOOT** (IO0)
2. Bấm nút **EN** (Reset) rồi thả ngay
3. Thả nút **BOOT**
4. Chạy lại lệnh upload ngay lập tức

---

## Serial log mẫu

```
╔══════════════════════════════════╗
║   IoT Gateway Node – Starting    ║
╚══════════════════════════════════╝
  Gateway ID : ESP32-GW-XXXXXXXX
  MQTT Topic : gateway/ESP32-GW-XXXXXXXX/data

[WiFi] Connecting to 'your-ssid'..........
[WiFi] OK – IP: 192.168.1.42
[NTP] Syncing....
[NTP] OK – 2024-06-01 08:00:00 (UTC+7)
[MQTT-SUB] Broker1: 192.168.1.100:1883
[MQTT-PUB] Broker2: 192.168.1.100:8883 (TLS)
[MQTT-SUB] Connecting to Broker1 192.168.1.100:1883 as 'gw-sub-ESP32-GW-XXXXXXXX'... OK
[MQTT-SUB] Subscribed to 'local/sensors/+/data'
[MQTT-PUB] Connecting to Broker2 192.168.1.100:8883 (TLS) as 'gw-ESP32-GW-XXXXXXXX'... OK
[Registry] Fetching sensor list from backend...
[Registry] Loaded 1 sensor(s)

[MAIN] Ready – listening for sensor data...

[Forwarder] Received: local/sensors/ESP32-SN-XXXXXXXX/data
[Forwarder] Sensor HMAC OK
[Forwarder] MQTT Publish → gateway/ESP32-GW-XXXXXXXX/data OK
```

---

## Thư viện phụ thuộc

| Thư viện | Phiên bản | Mục đích |
|---|---|---|
| [PubSubClient](https://github.com/knolleary/pubsubclient) | ^2.8 | MQTT client |
| [ArduinoJson](https://arduinojson.org/) | ^6.21.5 | Parse/build JSON |
| WiFiClientSecure | tích hợp Arduino core | TLS cho kết nối Broker 2 |
| mbedTLS | tích hợp ESP-IDF | HMAC-SHA256, TLS 1.2 |
