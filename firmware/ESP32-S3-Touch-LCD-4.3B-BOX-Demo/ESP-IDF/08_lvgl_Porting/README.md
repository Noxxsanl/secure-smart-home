# Gateway S3 — Waveshare ESP32-S3-Touch-LCD-4.3B-BOX (bản sơ bộ)

Firmware ESP-IDF v5.4.4 cho Gateway của bộ demo Smart Home: ESP32-S3-N16R8 (flash 16 MB, PSRAM 8 MB Octal), màn hình 4.3" 800×480 RGB, RTC PCF85063. Xuất phát từ ví dụ **08_lvgl_Porting** của Waveshare: driver LCD RGB, cảm ứng GT911 và LVGL port **giữ nguyên code**, chỉ chuyển vào `components/drivers/src/lcd/`.

Thiết kế: [IOT_NODE_NETWORK](../../../../docs/firmware/IOT_NODE_NETWORK.md) §3, §5, §6, §7. Hợp đồng: [API_DESIGN](../../../../docs/API_DESIGN.md) §3, §8, §9, §10.2, §11. Lệnh build/nạp chung: [ESP_IDF_BUILD](../../../../docs/guides/ESP_IDF_BUILD.md). Từng bước chuẩn bị + nạp Gateway cùng ESP32-CAM để xem hình camera: [NAP_CAMERA_GATEWAY](../../../../docs/guides/NAP_CAMERA_GATEWAY.md).

> **Trạng thái:** xem mục [Kiểm tra](#kiểm-tra) — đã biên dịch, **chưa nạp lên board**, chưa thử đầu-cuối với Node/Camera/Server thật.

## Đã có / chưa có

| Chức năng | Trạng thái | File (trong `components/`) |
|---|---|---|
| LCD RGB 800×480 + LVGL 8.4 + cảm ứng GT911 (ví dụ Waveshare, không sửa) | Có | `drivers/src/lcd/` |
| Bus I2C chung, RTC PCF85063 (đọc khi khởi động, ghi sau NTP) | Có | `drivers/src/gw_i2c.c`, `gw_rtc.c` |
| Đọc identity, WiFi router, Local AP, cloud, danh sách node/camera từ NVS | Có | `services/src/gw_config.c`, `gw_registry.c` |
| WiFi AP+STA: router của nhà + Local AP WPA2 cho camera (tự sinh nếu chưa có) | Có | `services/src/gw_wifi.c` |
| Giờ: RTC → SNTP → ghi lại RTC | Có | `services/src/gw_time.c` |
| ESP-NOW với Node/Camera: lọc MAC, peer mã hoá LMK, chống trùng `seq`, `PING`/`HEARTBEAT` → `TIME_SYNC` | Có | `services/src/gw_espnow.c` |
| Kiểm HMAC lớp 1 telemetry của node (gắn `sensor_id` với MAC, ±300 s, không lùi giờ) | Có | `services/src/gw_espnow.c` |
| Nhận ảnh camera `POST /local/camera/snapshot`: chỉ trên Local AP, HMAC camera, ≤ 200 KB, JPEG | Có | `services/src/gw_local_http.c` |
| Telemetry → MQTT TLS `gateway/<gw>/data` (HMAC lớp 2), dự phòng `POST /api/device/data` | Có | `services/src/gw_envelope.c`, `gw_mqtt.c`, `gw_api.c` |
| Nhận lệnh `home/+/gateway/<gw>/device/+/command`: kiểm HMAC + ts + chống phát lại → ESP-NOW `CMD` → `CMD_ACK` → `.../command/ack` | Có | `services/src/gw_mqtt.c`, `application/src/gw_app.c` |
| Lệnh gateway `restart` | Có | `application/src/gw_app.c` |
| Lệnh camera `snapshot` (camera tự chụp, gửi ảnh, `CMD_ACK`) | Có | như trên |
| Heartbeat `home/<h>/gateway/<gw>/heartbeat`, sự kiện `.../camera/event`, gửi ảnh `POST /api/device/camera/snapshot` | Có ở firmware, **backend chưa có** (đề xuất) | `gw_envelope.c`, `gw_api.c` |
| Giao diện cảm ứng: header (WiFi, Server, giờ) · thanh nav 3 mục **Camera / Phòng khách / Thiết bị** · nội dung mục đang chọn · dòng trạng thái | Có — chữ tiếng Việt có dấu (font riêng `ui/fonts/`), cảm ứng GT911 bật | `ui/src/gw_ui.c` |
| Trang Phòng khách: nhiệt độ, độ ẩm (ô lớn) + trạng thái quạt, điều hoà, đèn, rèm cửa + node kết nối/RSSI/lần cập nhật | Có ở màn hình; trường trạng thái là **đề xuất**, node chưa gửi (mục *Giao diện*) | như trên |
| Trang Thiết bị: bảng thiết bị đã ghép — loại, chấm kết nối xanh/vàng/đỏ, RSSI, giờ lần cuối kết nối (lưu NVS `seen`, nhớ qua khởi động lại) | Có — chi tiết: [MAN_HINH_GATEWAY](../../../../docs/guides/MAN_HINH_GATEWAY.md) | `ui/src/gw_ui.c`, `services/src/gw_registry.c` |
| Xem trực tiếp ở trang Camera: kéo MJPEG `GET /stream` (ký HMAC camera, IP lấy từ DHCP Local AP theo MAC đã ghép), giải nén bằng TJpgDec trong ROM, co về 448×336; góc phải hàng tiêu đề báo kết nối Camera ↔ Gateway | Có — luồng chỉ chạy khi đang ở trang Camera; có chuyển động thì tự chuyển sang trang Camera | `services/src/gw_camera_live.c`, `ui/`, `application/src/gw_app.c` |
| Ảnh chụp do chuyển động: nhận, kiểm HMAC, đẩy lên Server (không hiện trên màn hình) | Có (Server chưa có endpoint) | `services/src/gw_local_http.c`, `application/src/gw_app.c` |
| Ghép nối ECDH (`PAIR_*`), cấp LMK/secret qua ESP-NOW, provisioning BLE/SoftAP | **Chưa**: nạp tay qua NVS | — |
| Lệnh `live_start`/`live_stop` từ Server (xem từ xa trên Mobile, IOT_NODE_NETWORK §5.5) | **Chưa**: trả ack `error` | — |
| `factory_reset`, OTA (`ota/command` đã kiểm HMAC, chỉ log) | **Chưa** | — |
| Đệm thẻ TF khi mất Internet | **Chưa**: bỏ gói, có log | — |

## Cấu trúc

```
08_lvgl_Porting/                     # project gateway_s3 (tên thư mục giữ theo ví dụ Waveshare)
├── CMakeLists.txt                   # trỏ thêm ../../../common bằng EXTRA_COMPONENT_DIRS
├── sdkconfig.defaults               # board + LVGL (theo ví dụ) + phân vùng, rollback, TLS trong PSRAM…; KHÔNG có secret
├── partitions_gateway.csv           # nvs 24K, otadata, phy, ota_0/ota_1 6M, storage, log — đúng 16 MB
├── nvs_dev.csv.example              # mẫu identity, WiFi, Local AP, cloud, node/camera; bản thật nvs_dev.csv bị gitignore
├── certs/mqtt_ca.crt                # CA nội bộ (gitignore) — chép từ infra/mosquitto/certs/ca.crt
├── main/main.c                      # app_main() → gw_app_start()
└── components/
    ├── lvgl__lvgl/                  # LVGL 8.4 — thư viện (gitignore, tải lại theo drivers/idf_component.yml)
    ├── espressif__esp_lcd_touch/    # thư viện cảm ứng (như trên)
    ├── espressif__esp_lcd_touch_gt911/
    ├── drivers/                     # phần cứng board
    │   ├── Kconfig.projbuild        # menu "Example Configuration" của ví dụ (LVGL task, chống xé hình, xoay)
    │   ├── idf_component.yml        # lvgl/lvgl >8.3.9,<9 + esp_lcd_touch_gt911 ^1 (của ví dụ)
    │   ├── include/                 # gw_display.h, gw_i2c.h, gw_rtc.h
    │   └── src/
    │       ├── lcd/                 # waveshare_rgb_lcd_port.c/.h, lvgl_port.c/.h — GIỮ NGUYÊN
    │       └── gw_display.c, gw_i2c.c, gw_rtc.c
    ├── services/                    # mạng, bảo mật, giao thức
    │   ├── Kconfig.projbuild        # menu "Gateway S3: services"
    │   ├── include/                 # gw_config, gw_registry, gw_time, gw_wifi, gw_espnow, gw_local_http,
    │   │                            # gw_camera_live, gw_tls, gw_envelope, gw_mqtt, gw_api
    │   └── src/
    ├── ui/                          # LVGL: header + nav 3 trang + dòng trạng thái (gw_ui), giải nén JPEG (src/gw_jpeg)
    │   └── fonts/                   # font tiếng Việt 16/20/24 (gw_font_vi_*.c) + gen_fonts.sh
    └── application/                 # luồng nghiệp vụ: nối drivers ↔ services ↔ ui (gw_app)

../../../common/                     # dùng chung với Node/Camera
├── security_manager/                # HMAC (sign, verify thời gian hằng ±300 s, sm_hmac_verify_hex)
└── espnow_proto/                    # khung ESP-NOW {ver, type, seq, body JSON} ≤ 250 byte
```

**Quy tắc phụ thuộc** (mũi tên = được include), ép bằng `REQUIRES`/`PRIV_REQUIRES` — include sai tầng báo `No such file`:

```
main ──► application ──► services ──► common/security_manager, common/espnow_proto, esp-mqtt, esp_http_*
               │    └──► ui ───────► drivers (gw_display: khoá LVGL) ──► lvgl, esp_lcd, driver (I2C cũ)
               └───────► drivers (gw_display, gw_rtc)
```

- `services` không biết `drivers`: RTC được truyền vào `gw_time` dưới dạng hàm (`gw_time_rtc_t`).
- `ui` không biết `services`: `application` đẩy dữ liệu vào `gw_ui_set_*` (có mutex), LVGL tự vẽ lại mỗi 500 ms trong task của nó.
- Secret gateway chỉ nằm trong `gw_config.c`, secret + LMK của node/camera chỉ nằm trong `gw_registry.c`; tầng khác ký/kiểm qua hàm, không đọc được giá trị (bất biến 1, 2).
- Code I2C dùng driver **cũ** (`driver/i2c.h`) vì code Waveshare dùng driver này; ESP-IDF 5 abort lúc khởi động nếu link cả driver mới (`driver/i2c_master.h`).

Task: `lvgl` (ví dụ, nhân 1, ưu tiên 2), `gw_espnow` (nhân 0), `gw_app` (nhân 0, xử lý sự kiện, không chặn lâu), `gw_uplink` (nhân 1, HTTPS chặn tới vài giây), `gw_live` (nhân 1, ưu tiên 1 — đọc luồng camera và giải nén từng khung, nhường CPU sau mỗi khung cho task watchdog), task MQTT, httpd.

Ảnh camera: ESP32-S3 không có bộ giải mã JPEG phần cứng → dùng TJpgDec có sẵn trong ROM (`rom/tjpgd.h`, như `esp32-camera`), không thêm thư viện. Ảnh được co/giãn vừa khung, giữ tỉ lệ (TJpgDec thu thô 1/2/4/8, phần lẻ co điểm gần nhất — `ui/src/gw_jpeg.c`). Khung hình có 2 bộ đệm RGB565 trong PSRAM (2 × 294 KB): giải nén vào bộ LVGL không vẽ rồi đổi dưới khoá LVGL. Giải nén không kịp thì khung cũ tự bị bỏ (camera dùng `CAMERA_GRAB_LATEST`), không dồn trễ.

## Xác thực từng chặng

| Chặng | Kiểm gì | Ở đâu |
|---|---|---|
| Node → Gateway (ESP-NOW) | MAC nguồn đã ghép · peer mã hoá LMK riêng · khung đúng phiên bản, ≤ 250 byte, body JSON object · bỏ `seq` trùng (8 gói/thiết bị) | `gw_espnow.c` |
| Telemetry node | `sensor_id` = device_id gắn với MAC đó · `sn_hmac = HMAC(secret node, "<sensor_id>:<sn_timestamp>")` · lệch ≤ ±300 s · `sn_timestamp` không lùi · chưa có giờ thì không nhận | `gw_espnow.c` → `gw_registry_verify` |
| Camera → Gateway (ảnh) | Kết nối tới IP Local AP (không nhận từ mạng router) · camera đã ghép · `X-Signature = HMAC(secret camera, "<device_id>:<ts>")` ±300 s · ts không lùi · ≤ 200 KB · bắt đầu bằng `FF D8` · kiểm xong mới đọc thân | `gw_local_http.c` |
| Gateway → Camera (mở luồng) | Chỉ tới IP mà DHCP Local AP cấp cho MAC camera đã ghép, khi camera đang kết nối · Gateway ký `HMAC(secret camera, "<device_id>:<ts>")`, camera kiểm ±300 s · mỗi khung ≤ 200 KB, bắt đầu bằng `FF D8` · nội dung khung không ký (dựa vào WPA2 Local AP, như ảnh chụp) | `gw_camera_live.c` |
| Server → Gateway (lệnh MQTT) | Topic đúng gateway_id · home_id là số · `HMAC(secret gw, "<command_id>:<device_id>:<action>:<ts>")` · ±300 s · `command_id` chưa gặp (16 lệnh gần nhất) | `gw_mqtt.c` |
| Gateway → Node (`CMD`) | Gửi kèm `ts` để node kiểm ±30 s; node bỏ lệnh trùng `command_id`; `CMD_ACK` phải đến từ đúng thiết bị đang chờ | `gw_espnow.c`, `gw_app.c` |
| Gateway → Server | MQTT TLS 8883 kiểm chứng bằng CA nhúng + SAN; `gw_hmac = HMAC(secret gw, "<gateway_id>:<ts>")`; ack `HMAC(secret gw, "<command_id>:<status>:<ts>")` | `gw_tls.c`, `gw_envelope.c` |

Không log secret, LMK, mật khẩu WiFi, chữ ký (bất biến 2); màn hình không hiển thị chúng. `mqtt://` và `http://` bị từ chối trừ khi bật `[DEV] CONFIG_GW_DEV_ALLOW_PLAINTEXT`; không có tuỳ chọn bỏ kiểm chứng chứng chỉ (bất biến 3).

## Hợp đồng với Server

| Chiều | Topic / endpoint | Payload | Backend |
|---|---|---|---|
| GW → S | MQTT `gateway/<gw>/data` QoS 1 | `{gateway_id, gw_timestamp, gw_hmac, gateway_ip?, sensor_payload}` | **Đã có** (`telemetry/features/ingest-mqtt`) |
| GW → S | `POST /api/device/data` (khi MQTT mất kết nối) | như trên | **Đã có** (`ingest-http`) |
| S → GW | `home/<h>/gateway/<gw>/device/<dev>/command` | `{command_id, action, ts, hmac}` | **Đã có** (`control`) |
| GW → S | `home/<h>/gateway/<gw>/device/<dev>/command/ack` | `{command_id, status, power?, ts, hmac}` — trong 5 s | **Đã có** |
| S → GW | `home/<h>/gateway/<gw>/command` | `restart` (làm), `factory_reset` (chưa) | **Đã có** |
| GW → S | `home/<h>/gateway/<gw>/heartbeat` mỗi 30 s | `{ts, uptime, rssi, ip, fw_version, nodes[], hmac}`, hmac `"<gateway_id>:<ts>"` | Đề xuất, chưa subscribe |
| GW → S | `.../device/<cam>/camera/event` | `{type:"motion", ts, snapshot_id?, hmac}`, hmac `"<device_id>:<type>:<ts>"` | Đề xuất, chưa subscribe |
| GW → S | `POST /api/device/camera/snapshot` | JPEG; header `X-Gateway-Id`, `X-Timestamp`, `X-Signature`, `X-Device-Id`, `X-Trigger`, `X-Command-Id?` | Đề xuất — hiện nhận 404 |

Gateway subscribe `home/+/...` (wildcard home_id) nên không cần biết trước home_id. home_id dùng cho heartbeat/camera event lấy từ NVS `cloud/home_id`, hoặc học từ topic lệnh hợp lệ đầu tiên.

Trên backend: Node phòng khách tạo với `device_type = sensor` (ingest chỉ nhận telemetry từ sensor), camera gán vào gateway này. Chuỗi ký heartbeat/camera event là đề xuất (API_DESIGN §14 Q2) — chốt cùng backend khi làm.

## Build lần đầu

Mở **ESP-IDF 5.4 PowerShell** (ESP_IDF_BUILD §1.2):

```powershell
cd E:\WorkSpace\secure-smart-home-iot\firmware\ESP32-S3-Touch-LCD-4.3B-BOX-Demo\ESP-IDF\08_lvgl_Porting

# CA của Broker 2 (infra/pki/gen_mqtt_certs.sh) — thiếu thì vẫn build được nhưng không kết nối TLS
New-Item -ItemType Directory -Force certs | Out-Null
Copy-Item ..\..\..\..\infra\mosquitto\certs\ca.crt certs\mqtt_ca.crt

# sdkconfig hiện có sinh từ cấu hình ví dụ (1 app 1 MB, chưa có phân vùng OTA) → phải sinh lại
Remove-Item sdkconfig, sdkconfig.old -ErrorAction SilentlyContinue
idf.py set-target esp32s3
idf.py build
```

`components/lvgl__lvgl`, `espressif__esp_lcd_touch*` đang có sẵn nên không tải lại; máy mới clone repo thì component manager tải về theo `components/drivers/idf_component.yml`. `dependencies.lock` sinh lại tự động (đường dẫn tuyệt đối của máy — đã gitignore). Đừng build với `IDF_COMPONENT_MANAGER=0`: component GT911 khai báo phụ thuộc `esp_lcd_touch` trong `idf_component.yml`.

Đổi tuỳ chọn không bí mật: `idf.py menuconfig` → *Gateway S3: services* (URI broker, URL backend, NTP, kênh Local AP, timeout ack…) và *Example Configuration* (LVGL). Độ phân giải 1024×600 và cảm ứng: `ESP_PANEL_USE_1024_600_LCD`, `CONFIG_EXAMPLE_LCD_TOUCH_CONTROLLER_GT911` trong `components/drivers/src/lcd/lvgl_port.h` (macro của ví dụ, không phải Kconfig). Cảm ứng **đang bật** (= 1, 2026-11-08) cho thanh nav; đây là dòng duy nhất đã sửa trong code ví dụ.

## Nạp NVS (giai đoạn dev)

Chưa có ghép nối/provisioning, nên nạp tay:

1. Chép `nvs_dev.csv.example` thành `nvs_dev.csv` (gitignore), điền:
   - `identity`: `device_uuid`, `device_secret` của **gateway** trên backend (secret chỉ trả 1 lần lúc tạo).
   - `wifi`: router 2.4 GHz của nhà. Bỏ trống thì Gateway chỉ chạy Local AP.
   - `local_ap`: SSID + mật khẩu ≥ 8 ký tự. Camera ghi đúng cặp này vào `wifi/ssid`, `wifi/password` của nó. Bỏ trống thì Gateway tự sinh (không in mật khẩu ra log).
   - `cloud`: `mqtt_uri` (host phải nằm trong SAN của cert broker), `api_url`; tuỳ chọn `home_id`.
   - `nodes`: `count` + mỗi thiết bị `<i>_kind` (`node`|`camera`), `<i>_id`, `<i>_secret`, `<i>_mac` (MAC Station của thiết bị), `<i>_lmk` (32 hex, **trùng** `pairing/session_key` trong NVS của thiết bị đó).
2. Phía Node/Camera: `pairing/gateway_mac` = MAC Station của Gateway — Gateway in ra khi khởi động: `gw_wifi: ... gateway STA MAC xx:xx:xx:xx:xx:xx`.
3. Sinh ảnh và ghi vào phân vùng `nvs` (24K = `0x6000`):

```powershell
python $env:IDF_PATH\components\nvs_flash\nvs_partition_generator\nvs_partition_gen.py generate nvs_dev.csv nvs_dev.bin 0x6000
python $env:IDF_PATH\components\partition_table\parttool.py -p COM5 write_partition --partition-name=nvs --input nvs_dev.bin
Remove-Item nvs_dev.bin
```

## Nạp firmware

```powershell
idf.py -p COM5 flash monitor
```

Log đúng:

```
I (...) gw_display: LCD 800x480 ready, touch on
I (...) gw_time: time from RTC: 1762...            (hoặc "RTC has no valid time" ở lần đầu)
I (...) gw_config: gateway_id=<id> wifi=<ssid> local_ap=<ssid> mqtt=mqtts://... api=... home_id=...
I (...) gw_registry: node <id> mac=... lmk=set
I (...) gw_registry: camera <id> mac=... lmk=set
I (...) gw_wifi: local AP "<ssid>" on channel 1; gateway STA MAC xx:xx:... (pairing/gateway_mac of nodes)
I (...) gw_espnow: ESP-NOW ready on channel 1
I (...) gw_local_http: local HTTP server on :80 (POST /local/camera/snapshot)
I (...) gw_wifi: router connected, ip=192.168.1.x, channel 6
I (...) gw_time: time synced from NTP: 1762...
I (...) gw_mqtt: connected to broker
I (...) gw_espnow: TELEMETRY <node id> verified (ts 1762...)
```

## Thử từng chặng

**Telemetry tới Server** — trên máy chủ (Broker 2, cert CA):

```bash
mosquitto_sub -h 192.168.1.100 -p 8883 --cafile infra/mosquitto/certs/ca.crt -t 'gateway/+/data' -v
```

**Nhận ảnh camera** khi chưa có ESP32-CAM: nối laptop vào Local AP của Gateway (Git Bash, có `openssl`):

```bash
read -rs SECRET                       # secret camera, không lưu vào history
ID=<camera device_id>; TS=$(date +%s)
SIG=$(printf '%s' "$ID:$TS" | openssl dgst -sha256 -hmac "$SECRET" | awk '{print $NF}')

# 201
curl -s -w '%{http_code}\n' -X POST -H "X-Device-Id: $ID" -H "X-Timestamp: $TS" -H "X-Signature: $SIG" \
  -H "X-Trigger: motion" -H "Content-Type: image/jpeg" --data-binary @anh.jpg http://192.168.4.1/local/camera/snapshot

# 401 khi sai chữ ký
curl -s -o /dev/null -w '%{http_code}\n' -X POST -H "X-Device-Id: $ID" -H "X-Timestamp: $TS" \
  -H "X-Signature: $(printf '0%.0s' {1..64})" -H "X-Trigger: motion" -H "Content-Type: image/jpeg" \
  --data-binary @anh.jpg http://192.168.4.1/local/camera/snapshot
```

Gửi cùng yêu cầu từ mạng router (IP STA của Gateway) phải nhận `403`. Nhận `201` thì log có `gw_local_http: snapshot from <id>: … bytes`.

**Giao diện và xem trực tiếp** — màn hình 800×480:

```
┌ GATEWAY NHÀ THÔNG MINH  WiFi 192.168.x.x    Máy chủ --      12:34:56 ┐
│ ┌───────────┐ ┌────────────────────────────────────────────────────┐ │
│ │ CAMERA    │ │ CAMERA CỬA              ● Đã kết nối  3.3 khung/s  │ │
│ │ Trực tiếp │ │ ┌────────────────────────────────────────────────┐ │ │
│ └───────────┘ │ │                                                │ │ │
│ ┌───────────┐ │ │            hình trực tiếp 448×336              │ │ │
│ │PHÒNG KHÁCH│ │ │                                                │ │ │
│ │28.4°C 61% │ │ │                                                │ │ │
│ └───────────┘ │ │                                                │ │ │
│ ┌───────────┐ │ │                                                │ │ │
│ │ THIẾT BỊ  │ │ └────────────────────────────────────────────────┘ │ │
│ │2/2 trực...│ └────────────────────────────────────────────────────┘ │
└ dòng trạng thái ──────────────────────────────────────────────────────┘

Trang Phòng khách:
  PHÒNG KHÁCH                                         ● Đã kết nối
  ┌ NHIỆT ĐỘ ───────────────┐ ┌ ĐỘ ẨM ──────────────────┐
  │ 28.4  °C                │ │ 61  %                   │
  └─────────────────────────┘ └─────────────────────────┘
  ┌ QUẠT ──┐ ┌ ĐIỀU HÒA ┐ ┌ ĐÈN ───┐ ┌ RÈM CỬA ┐      (ô xanh = đang bật/mở)
  │ BẬT    │ │ TẮT      │ │ BẬT    │ │ MỞ      │
  │Đang chạy│ │Đang tắt  │ │Đang sáng│ │Mở 60%   │
  └────────┘ └──────────┘ └────────┘ └─────────┘
  Node <id>  |  Ánh sáng 350 lux  |  Cập nhật 12:30:05  |  -58 dBm
```

| Trang | Nội dung |
|---|---|
| Camera | Hình trực tiếp (chỉ kéo luồng khi đang ở trang này — IOT_NODE_NETWORK §5.4). Góc phải: kết nối Camera ↔ Gateway — **xanh** đang nhận hình (kèm khung/s), **vàng** đang kết nối / đã thấy camera qua ESP-NOW nhưng chưa có hình, **đỏ** mất kết nối (luồng đứt hoặc không thấy gói ESP-NOW trong `CONFIG_GW_NODE_OFFLINE_S`). Luồng rớt thì tự nối lại; camera mất hẳn thì thử lại sau 5 s, lùi dần tới 60 s |
| Phòng khách | Nhiệt độ, độ ẩm (ô lớn); trạng thái **quạt, điều hoà (kèm nhiệt độ đặt), đèn, rèm cửa** (chỉ xem, chưa điều khiển từ màn hình); góc phải: kết nối node ↔ Gateway; dòng cuối: node, ánh sáng, lần cập nhật, RSSI |
| Thiết bị | Bảng node/camera đã ghép: chấm kết nối, tín hiệu (RSSI), giờ lần cuối kết nối — [MAN_HINH_GATEWAY](../../../../docs/guides/MAN_HINH_GATEWAY.md) §2 |

Trạng thái thiết bị phòng khách lấy từ `data` trong telemetry của node — **đề xuất, node chưa gửi** (`firmware/esp32_s3_firmware_node/README.md`, *Đề xuất hợp đồng cần chốt*). Gateway chỉ cập nhật trường có mặt, nên node gửi chung với số đo hay tách gói riêng (khi đổi trạng thái) đều được; chưa có trường nào thì ô hiện "--" / "Node chưa báo". Backend nhận `data` là object bất kỳ nên không phải sửa luồng ingest.

| Trường `data` | Giá trị | Ô |
|---|---|---|
| `temperature`, `humidity` | số | NHIỆT ĐỘ, ĐỘ ẨM |
| `light` | lux | dòng thông tin |
| `fan`, `ac`, `lamp` | `0`/`1` hoặc `false`/`true` | QUẠT, ĐIỀU HÒA, ĐÈN (`light` đã là lux nên đèn dùng `lamp`) |
| `ac_temp` | °C | nhiệt độ đặt, hiện khi điều hoà bật |
| `curtain` | `0` đóng, `1` mở, `2..100` mở theo % | RÈM CỬA |

| Tuỳ chọn (menuconfig → *Gateway S3: services*) | Mặc định |
|---|---|
| `Trang hiện khi khởi động` (`CONFIG_GW_UI_START_PAGE_*`) | Camera |
| `Chuyển sang trang Camera khi có chuyển động…` (`CONFIG_GW_CAMERA_LIVE_ON_MOTION_S`) — 30 s sau quay lại trang cũ; chạm nav thì huỷ việc quay lại | 30 s |
| `Độ phân giải luồng camera` (VGA, hoặc QVGA phóng lên nếu VGA quá giật), `Chất lượng JPEG của luồng` | VGA, q=12 |

Xem trực tiếp cần camera đã vào Local AP **và** đã có giờ (TIME_SYNC qua ESP-NOW: `pairing/gateway_mac` + `session_key` của camera khớp `nodes/<i>_mac`, `<i>_lmk` của Gateway). Đo trên board 2026-11-08 (khung 640×480 cũ): VGA q=12 khoảng **3,3 khung/s** (87 khung/26 s), ảnh chụp SVGA ~11 KB tới Gateway trong < 0,3 s sau khi PIR báo. Cảm ứng GT911 khởi tạo được trên board (`TouchPad_ID:0x39,0x31,0x31`; cảnh báo `Unable to initialize the I2C address` là driver thử địa chỉ thứ nhất, không ảnh hưởng).

Log đúng: `gw_app: live view <id> (camera page)` rồi `gw_camera_live: streaming from camera <id> (192.168.4.x, vga, q=12)`. Sửa thẳng `Kconfig.projbuild`/`sdkconfig.defaults` thì chạy `idf.py reconfigure` trước khi build, vì `idf.py build` không tự đọc lại. Độ phân giải/chất lượng: menuconfig → *Gateway S3: services* → `Độ phân giải luồng camera` (VGA, hoặc QVGA phóng ×2 nếu VGA quá giật), `Chất lượng JPEG của luồng`.

**Lệnh bật/tắt**: dùng Mobile/Dashboard (`POST /devices/:id/commands`) — backend ký lệnh, Gateway chuyển xuống node, ack về trong 5 s. Lệnh chưa ký đúng bị bỏ, backend báo `TIMEOUT`.

## Xử lý sự cố

| Hiện tượng | Nguyên nhân thường gặp |
|---|---|
| `app partition is too small` hoặc vẫn chạy demo cũ | `sdkconfig` cũ của ví dụ — xoá `sdkconfig`, `idf.py set-target esp32s3` |
| `CONFLICT! driver_ng is not allowed to be used with this old driver` | Có code dùng `driver/i2c_master.h` — gateway phải dùng driver I2C cũ (mục Cấu trúc) |
| Màn hình "Gateway chưa được cấp phát" | Chưa nạp `nvs_dev.bin`, sai tên namespace/key |
| `mqtts://... needs CA` | Thiếu `certs/mqtt_ca.crt` lúc build |
| MQTT `transport error` | Host trong `mqtt_uri` không có trong SAN của cert broker, hoặc sai giờ (cert "chưa hiệu lực") |
| `drop TELEMETRY ... HMAC mismatch` | `<i>_secret` khác secret trong NVS của node |
| `drop TELEMETRY ... gateway clock not synced` | Chưa có NTP và RTC chưa từng được đặt giờ |
| Node log "gateway acks at MAC level but sends no TIME_SYNC" | LMK hai bên khác nhau, hoặc Gateway chưa có giờ |
| `peer ... has no LMK — refusing unencrypted ESP-NOW` | Thiếu `<i>_lmk`. Khi dev có thể bật `[DEV]` ở cả hai phía |
| Camera không vào được Local AP | Mật khẩu `local_ap` khác `wifi/password` của camera; camera lọc WPA2 trở lên |
| Xem trực tiếp: "Camera chưa vào Local AP" | Camera chưa nối Local AP, hoặc `nodes/<i>_mac` không phải MAC Station của camera |
| Xem trực tiếp: "Camera chưa có giờ" (camera trả 503) | Camera chưa nhận TIME_SYNC: ESP-NOW chưa ghép (sai `gateway_mac`/LMK hai phía), hoặc Gateway chưa có giờ |
| Xem trực tiếp: "Camera từ chối chữ ký" (401) | `nodes/<i>_secret` khác `identity/device_secret` trong NVS camera, hoặc giờ hai bên lệch > 300 s |
| Có hình nhưng giật (< 3 khung/s) | Chọn QVGA, hoặc tăng `CONFIG_GW_CAMERA_LIVE_QUALITY` (khung nhẹ hơn) |
| Chạm màn hình không có tác dụng | Cảm ứng tắt (`CONFIG_EXAMPLE_LCD_TOUCH_CONTROLLER_GT911` = 0 trong `lvgl_port.h`); log có `gw_ui: touch is off` |
| Reset liên tục ngay sau "Initialize touch controller GT911" | GT911 không trả lời (cáp màn hình, board khác đời): code ví dụ dừng bằng `ESP_ERROR_CHECK`. Tạm đặt macro trên = 0 để chạy không cảm ứng |

## Việc còn lại

1. ~~Font tiếng Việt có dấu~~ — xong 2026-11-09: `ui/fonts/gw_font_vi_16/20/24.c` (Montserrat Medium + biểu tượng LVGL, chỉ ASCII + `°` + 134 chữ cái tiếng Việt), sinh lại bằng `bash components/ui/fonts/gen_fonts.sh` (cần Node.js, npx tải `lv_font_conv@1.5.2`). Thêm ký tự mới (VD `…`, `₫`) thì sửa script rồi chạy lại.
2. Ghép nối ECDH + PMK chung (WiFi Provisioning §9) thay cho nạp tay `nodes/*` — bỏ hẳn nhu cầu `GET /api/device/sensors`.
3. Backend: `POST /api/device/camera/snapshot`, subscribe `heartbeat` và `camera/event`, chốt chuỗi ký (API_DESIGN §14 Q2), thêm action `snapshot` vào `DeviceAction`.
4. Đo số khung/giây thật của xem trực tiếp trên board. Nếu TJpgDec trong ROM không đủ (mục tiêu 10 khung/s, §5.4) thì thay phần thân `ui/src/gw_jpeg.c` bằng `espressif/esp_new_jpeg` (tối ưu SIMD cho S3, cần tải thư viện). Xem từ xa trên Mobile (`live_start`/`live_stop`, §5.5) cần Backend có WebSocket `/api/device/camera/live`.
5. Đệm thẻ TF khi mất Internet (§7, §10 Q3), OTA, `factory_reset` có xác nhận 2 bước trên màn hình.
6. Production: NVS Encryption, Flash Encryption + Secure Boot v2 (đốt eFuse — làm khi ổn định), ACL Mosquitto theo gateway.

## Kiểm tra

2026-11-07, ESP-IDF 5.4.4, `idf.py build` với thư mục build và sdkconfig riêng (sinh từ `sdkconfig.defaults`), component manager dùng thư viện có sẵn trong `components/`:

| Kiểm | Kết quả |
|---|---|
| Biên dịch 22 file của gateway + `common/` (build sạch, thêm `gw_camera_live.c`, `gw_jpeg.c`) | 0 lỗi, 0 cảnh báo (cả log build) |
| Ảnh firmware | `gateway_s3.bin` 0x1605B0 byte (~1,38 MB, có font 40 + cảm ứng — 2026-11-08), slot OTA 6 MB còn trống 77% |
| TJpgDec ROM | `jd_prepare` = 0x40000858, `jd_decomp` = 0x40000864 (ROM ESP32-S3, không tốn flash) |
| Bảng phân vùng | Vừa 16 MB, app đầu ở 0x20000 |
| Chưa có `certs/mqtt_ca.crt` | CMake cảnh báo, vẫn build; lúc chạy từ chối `mqtts://` |

**Chưa làm:** nạp lên board, chạy với Node/Camera/Server thật, đo RAM/PSRAM lúc chạy (LCD RGB + WiFi AP+STA + 2 phiên TLS + ~1,5 MB bộ đệm ảnh camera), đo số khung/giây thật của xem trực tiếp. `gw_display_backlight` chưa có chỗ gọi nên chưa được link (để dành cho tắt màn hình).
