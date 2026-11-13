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
| Heartbeat `home/<h>/gateway/<gw>/heartbeat`, sự kiện `.../camera/event`, gửi ảnh `POST /api/device/camera/snapshot` | Có — backend nhận từ 2026-11-10 (module `devices` heartbeat, module `camera`) | `gw_envelope.c`, `gw_api.c` |
| Giao diện cảm ứng: header (WiFi, Server, giờ) · thanh nav 3 mục **Camera / Phòng khách / Thiết bị** · nội dung mục đang chọn · dòng trạng thái | Có — chữ tiếng Việt có dấu (font riêng `ui/fonts/`), cảm ứng GT911 bật | `ui/src/gw_ui.c` |
| Trang Phòng khách: nhiệt độ, độ ẩm (ô lớn) + trạng thái quạt, điều hoà, đèn, rèm cửa + node kết nối/RSSI/lần cập nhật | Có ở màn hình; trường trạng thái là **đề xuất**, node chưa gửi (mục *Giao diện*) | như trên |
| Trang Thiết bị: bảng thiết bị đã ghép — loại, chấm kết nối xanh/vàng/đỏ, RSSI, giờ lần cuối kết nối (lưu NVS `seen`, nhớ qua khởi động lại) | Có — chi tiết: [MAN_HINH_GATEWAY](../../../../docs/guides/MAN_HINH_GATEWAY.md) | `ui/src/gw_ui.c`, `services/src/gw_registry.c` |
| Xem trực tiếp ở trang Camera: kéo MJPEG `GET /stream` (ký HMAC camera, IP lấy từ DHCP Local AP theo MAC đã ghép); task `gw_live` CHỈ đọc mạng vào bộ đệm PSRAM, task `gw_decode` riêng (nhân 1) lấy khung MỚI NHẤT, giải nén bằng `espressif/esp_new_jpeg` thẳng ra RGB565 và thu về 448×336; góc phải hàng tiêu đề báo kết nối Camera ↔ Gateway | Có — luồng chạy khi đang ở trang Camera (hoặc có phiên xem từ xa); có chuyển động thì tự chuyển sang trang Camera. **Chưa đo trên board** sau khi đổi bộ giải nén (trước đó ≈ 3,3 khung/s với TJpgDec) | `services/src/gw_camera_live.c`, `ui/src/gw_live_view.c`, `ui/src/gw_jpeg_esp.c`, `application/src/gw_app.c` |
| Ảnh chụp do chuyển động: nhận, kiểm HMAC, đẩy lên Server (không hiện trên màn hình) | Có — ảnh hiện trên web khách + Mobile ([LEN_SERVER](../../../../docs/guides/LEN_SERVER.md)) | `services/src/gw_local_http.c`, `application/src/gw_app.c` |
| Ghép nối ECDH (`PAIR_*`), cấp LMK/secret qua ESP-NOW, provisioning BLE/SoftAP | **Chưa**: nạp tay qua NVS | — |
| Lệnh `live_start`/`live_stop` từ Server = xem từ xa trên web user (IOT_NODE_NETWORK §5.5): Gateway đẩy khung JPEG nguyên vẹn lên Server qua WebSocket TLS `/api/device/camera/live`, không ack; LCD hiện nhãn "Đang được xem từ xa" | Có (bước 1, **chưa thử đầu-cuối**) — cần Backend có WS `/api/device/camera/live` (đang làm song song, hợp đồng ở mục *Xem từ xa*) | `services/src/gw_camera_relay.c`, `application/src/gw_app.c` |
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
    │   │                            # gw_camera_live, gw_camera_relay, gw_tls, gw_envelope, gw_mqtt, gw_api
    │   └── src/
    ├── espressif__esp_new_jpeg/     # thư viện giải nén JPEG (gitignore, tải lại theo ui/idf_component.yml — xem Build lần đầu)
    ├── ui/                          # LVGL: header + nav 3 trang + dòng trạng thái (gw_ui), đường ống hình camera (src/gw_live_view),
    │                                # giải nén JPEG (src/gw_jpeg_esp; src/gw_jpeg_tjpgd là dự phòng, Kconfig GW_UI_JPEG_TJPGD)
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

Task: `lvgl` (ví dụ, nhân 1, ưu tiên 2), `gw_espnow` (nhân 0), `gw_app` (nhân 0, ưu tiên 4, xử lý sự kiện, không chặn lâu), `gw_uplink` (nhân 1, HTTPS chặn tới vài giây), `gw_live` (nhân 0, ưu tiên 3 — CHỈ đọc luồng MJPEG của camera), `gw_decode` (nhân 1, ưu tiên 1 — giải nén khung cho LCD, nhường LVGL), `gw_relay` (nhân 0, ưu tiên 2 — WebSocket TLS lên Server khi có phiên xem từ xa), task MQTT, httpd. `gw_live` và `gw_decode` nhường CPU 1 ms sau mỗi khung cho task watchdog.

**Đường ống hình camera (2026-11-13).** 1 luồng `GET /stream` duy nhất, chia cho 2 nơi; mỗi nơi chỉ giữ khung MỚI NHẤT:

```
camera ─HTTP MJPEG→ gw_live (nhân 0) ─ vào 1 trong 4 bộ đệm JPEG PSRAM (4 × 200 KB), trao CON TRỎ (đếm tham chiếu, không chép)
                       ├─ LCD đang ở trang Camera ─→ gw_decode (nhân 1): lấy khung mới nhất → esp_new_jpeg → 1 trong 2 bộ đệm RGB565 → đổi nguồn ảnh dưới khoá LVGL
                       └─ có phiên xem từ xa ─────→ gw_relay (nhân 0): giữ 1 khung chờ, ≤ CONFIG_GW_CAMERA_RELAY_MAX_FPS → WebSocket TLS
```

Khung cũ chưa kịp xử lý bị thay (không xếp hàng) và được đếm vào "bỏ"; thông lượng = max(nhận, giải nén) thay vì tổng, đọc mạng không bao giờ chờ giải nén hay gửi. Bộ đệm chung có 4 ô vì tối đa 3 ô bị giữ cùng lúc (decode đang xử lý + decode chờ + relay chờ) và 1 ô đang đọc. Riêng relay chép khung (≤ 200 KB, ~0,3 ms) sang bộ đệm gửi riêng vì tầng WebSocket của ESP-IDF che (mask) dữ liệu **tại chỗ** khi gửi — không gửi thẳng từ bộ đệm đang chia sẻ với LCD được. Mỗi 5 s log (ESP_LOGI): `gw_camera_live: rx … fps` (nhận từ camera), `gw_live_view: shown … fps, decode avg … ms, submitted …, dropped …` (LCD), `gw_camera_relay: relay sent … fps, … KB/s, offered …, dropped …` (relay).

Ảnh camera: ESP32-S3 không có bộ giải mã JPEG phần cứng → dùng `espressif/esp_new_jpeg` 1.0.2 (thư viện dựng sẵn, tối ưu cho S3), xuất RGB565 little-endian đúng thứ tự byte của LVGL (`LV_COLOR_DEPTH` 16, không `LV_COLOR_16_SWAP`) thẳng vào bộ đệm ảnh. Ô hiển thị giữ **448×336**: VGA 640×480 → 448×336 là tỉ lệ 0,7, cả hai cạnh là bội của 8 nên dùng được `scale` của bộ giải nén (cạnh ra bội của 8, ≥ 1/8) — giải nén và thu nhỏ trong 1 lần, không bước co giãn riêng. Ảnh nhỏ hơn ô (QVGA) hoặc cỡ lạ thì giải nén nguyên kích thước vào bộ đệm phụ PSRAM rồi co/giãn điểm gần nhất (`ui/src/gw_jpeg_esp.c`); nếu `scale` của thư viện lỗi trên board thì tự chuyển sang đường này (log 1 lần). 2 bộ đệm RGB565 (2 × 294 KB) trong PSRAM. `TJpgDec` trong ROM (`gw_jpeg_tjpgd.c`) vẫn còn làm dự phòng: menuconfig → *Gateway S3: ui* → `[Dự phòng] Giải nén JPEG bằng TJpgDec`.

## Xác thực từng chặng

| Chặng | Kiểm gì | Ở đâu |
|---|---|---|
| Node → Gateway (ESP-NOW) | MAC nguồn đã ghép · peer mã hoá LMK riêng · khung đúng phiên bản, ≤ 250 byte, body JSON object · bỏ `seq` trùng (8 gói/thiết bị) | `gw_espnow.c` |
| Telemetry node | `sensor_id` = device_id gắn với MAC đó · `sn_hmac = HMAC(secret node, "<sensor_id>:<sn_timestamp>")` · lệch ≤ ±300 s · `sn_timestamp` không lùi · chưa có giờ thì không nhận | `gw_espnow.c` → `gw_registry_verify` |
| Camera → Gateway (ảnh) | Kết nối tới IP Local AP (không nhận từ mạng router) · camera đã ghép · `X-Signature = HMAC(secret camera, "<device_id>:<ts>")` ±300 s · ts không lùi · ≤ 200 KB · bắt đầu bằng `FF D8` · kiểm xong mới đọc thân | `gw_local_http.c` |
| Gateway → Server (xem từ xa) | WSS tới base URL của `gw_api` (CA nhúng + so tên host; `http://` → `ws://` chỉ khi `[DEV]`) · header `X-Signature = HMAC(secret gw, "<gateway_id>:<ts>:<device_id>:<session_id>")` hex thường, ký lại mỗi lần nối · khung nhị phân = 1 JPEG nguyên vẹn · không log session_id/chữ ký | `gw_camera_relay.c` |
| Gateway → Camera (mở luồng) | Chỉ tới IP mà DHCP Local AP cấp cho MAC camera đã ghép, khi camera đang kết nối · Gateway ký `HMAC(secret camera, "<device_id>:<ts>")`, camera kiểm ±300 s · mỗi khung ≤ 200 KB, bắt đầu bằng `FF D8` · nội dung khung không ký (dựa vào WPA2 Local AP, như ảnh chụp) | `gw_camera_live.c` |
| Server → Gateway (lệnh MQTT) | Topic đúng gateway_id · home_id là số · `HMAC(secret gw, "<command_id>:<device_id>:<action>:<ts>")` · ±300 s · `command_id` chưa gặp (16 lệnh gần nhất). Dùng chung cho `live_start`/`live_stop` (camera phải là thiết bị đã ghép) | `gw_mqtt.c`, `gw_app.c` |
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
| GW → S | `home/<h>/gateway/<gw>/heartbeat` mỗi 30 s | `{ts, uptime, rssi, ip, fw_version, nodes[], hmac}`, hmac `"<gateway_id>:<ts>"` | **Đã có** (`devices/features/gateway-heartbeat`): đánh dấu gateway + node `online:true` thuộc gateway là đang kết nối |
| GW → S | `.../device/<cam>/camera/event` | `{type:"motion", ts, snapshot_id?, hmac}`, hmac `"<device_id>:<type>:<ts>"` | **Đã có** (`camera/features/camera-event`): thông báo "Phát hiện chuyển động" |
| S → GW | `home/<h>/gateway/<gw>/device/<cam>/command` với `action` = `live_start` / `live_stop` | như lệnh thường (`command_id` = `session_id` của phiên xem); Gateway **không ack** | Backend làm song song (module `camera`/`control`) |
| GW → S | WebSocket `GET /api/device/camera/live` (qua nginx :443) | header `X-Gateway-Id`, `X-Device-Id`, `X-Session-Id`, `X-Timestamp`, `X-Signature` (xem *Xem từ xa*); nhị phân = 1 khung JPEG; văn bản `{"type":"status","state":"connecting"/"streaming"/"camera_unavailable"}`, `{"type":"end"}` | Backend làm song song |
| GW → S | `POST /api/device/camera/snapshot` | JPEG; header `X-Gateway-Id`, `X-Timestamp`, `X-Device-Id`, `X-Trigger`, `X-Command-Id?`, `X-Signature` = HMAC(secret gw, `"<gateway_id>:<ts>:<device_id>:<trigger>:<command_id>:<sha256 thân ảnh>"`) — gắn chữ ký với đúng ảnh (2026-11-10) | **Đã có** (`camera/features/ingest-snapshot`), qua nginx HTTPS :443; trả `201 {snapshot_id}` |

Gateway subscribe `home/+/...` (wildcard home_id) nên không cần biết trước home_id. home_id dùng cho heartbeat/camera event lấy từ NVS `cloud/home_id`, hoặc học từ topic lệnh hợp lệ đầu tiên.

Trên backend: Node phòng khách tạo với `device_type = sensor` (ingest chỉ nhận telemetry từ sensor), camera `category = camera` gán vào gateway này — `cd backend && npm run hw:register` làm việc này từ `nvs_dev.csv` (không in secret). Chuỗi ký heartbeat/camera event ở trên đã được backend dùng (2026-11-10). Từng bước nối Server: [LEN_SERVER](../../../../docs/guides/LEN_SERVER.md).

## Build lần đầu

Mở **ESP-IDF 5.4 PowerShell** (ESP_IDF_BUILD §1.2):

```powershell
cd E:\WorkSpace\secure-smart-home-iot\firmware\ESP32-S3-Touch-LCD-4.3B-BOX-Demo\ESP-IDF\08_lvgl_Porting

# CA của Broker MQTT (infra/pki/gen_mqtt_certs.sh) — thiếu thì vẫn build được nhưng không kết nối TLS
New-Item -ItemType Directory -Force certs | Out-Null
Copy-Item ..\..\..\..\infra\mosquitto\certs\ca.crt certs\mqtt_ca.crt

# sdkconfig hiện có sinh từ cấu hình ví dụ (1 app 1 MB, chưa có phân vùng OTA) → phải sinh lại
Remove-Item sdkconfig, sdkconfig.old -ErrorAction SilentlyContinue
idf.py set-target esp32s3
idf.py build
```

`components/lvgl__lvgl`, `espressif__esp_lcd_touch*`, `espressif__esp_new_jpeg` đang có sẵn nên không tải lại; máy mới clone repo thì component manager tải về theo `components/drivers/idf_component.yml` (LVGL, GT911) và `components/ui/idf_component.yml` (`espressif/esp_new_jpeg ^1.0.2`: lần build đầu cần Internet, thư viện vào `managed_components/`; muốn build offline như LVGL thì chép `managed_components/espressif__esp_new_jpeg` sang `components/espressif__esp_new_jpeg` rồi xoá `managed_components/` — thư mục `components/*__*` đã gitignore). `dependencies.lock` sinh lại tự động (đường dẫn tuyệt đối của máy — đã gitignore). Đừng build với `IDF_COMPONENT_MANAGER=0`: component GT911 khai báo phụ thuộc `esp_lcd_touch` trong `idf_component.yml`.

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

**Telemetry tới Server** — trên máy chủ (Broker MQTT, cert CA):

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
┌ Gateway Smart Home                        Th 7 14/11/2026  12:34:56 ┐
│ ┌───────────┐ ┌────────────────────────────────────────────────────┐ │
│ │ CAMERA    │ │ CAMERA CỬA              ● Đã kết nối  3.3 khung/s  │ │
│ │ Trực tiếp │ │ ┌────────────────────────────────────────────────┐ │ │
│ └───────────┘ │ │                                                │ │ │
│ ┌───────────┐ │ │            hình trực tiếp 448×336              │ │ │
│ │LIVING ROOM│ │ │                                                │ │ │
│ │28.4°C 61% │ │ │                                                │ │ │
│ └───────────┘ │ │                                                │ │ │
│ ┌───────────┐ │ │                                                │ │ │
│ │ THIẾT BỊ  │ │ └────────────────────────────────────────────────┘ │ │
│ │2/2 trực...│ └────────────────────────────────────────────────────┘ │
└ dòng trạng thái                     WiFi 192.168.x.x   Máy chủ OK ─┘

Trang Living Room (công tắc và nút mức điều khiển thẳng Node qua ESP-NOW — docs/guides/MAN_HINH_GATEWAY.md):
  LIVING ROOM                                         ● Đã kết nối
  ┌ NHIỆT ĐỘ ───────────────┐ ┌ ĐỘ ẨM ──────────────────┐
  │ 28.4  °C                │ │ 61  %                   │
  └─────────────────────────┘ └─────────────────────────┘
  ┌ Quạt  [●═]┐ ┌ Điều hòa[═●]┐ ┌ Đèn   [═●]┐ ┌ Rèm cửa   [═●]┐   (ô xanh = đang bật/mở; không chữ trạng thái)
  │           │ │ Đặt 26°C    │ │           │ │               │
  │           │ │             │ │           │ │ [50%] [100%]  │
  └───────────┘ └─────────────┘ └───────────┘ └───────────────┘
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

### Xem từ xa (relay lên Server, 2026-11-13)

Server gửi `live_start` (command_id = session_id) → Gateway mở WSS `…/api/device/camera/live` và đẩy khung camera (tối đa `CONFIG_GW_CAMERA_RELAY_MAX_FPS`, mặc định 15; menuconfig → *Gateway S3: services* → `Tốc độ tối đa gửi khung camera lên Server…`, 1–25). `live_stop` khớp phiên → gửi `{"type":"end"}`, close 1000 rồi dừng. `live_start` với session mới khi đang có phiên khác → đóng phiên cũ, mở phiên mới. Rớt mạng giữa phiên → nối lại cùng session sau 1, 2, 4 s (ký lại `ts`); Upgrade bị trả 409 (uplink cũ còn sống) hoặc 429 (giới hạn tần suất) cũng nối lại 1, 2, 4 s với ts + chữ ký mới. Server đóng (close frame), trả 400/401/403/404 lúc upgrade, hoặc hết 3 lần nối lại → dừng phiên đó, không nối lại, chờ `live_start` mới. Gateway trả PONG khi Server PING. Trạng thái gửi cho Server: `connecting` (chưa có khung), `streaming` (đang gửi), `camera_unavailable` (camera đứt/chưa vào Local AP) — khi đổi trạng thái và mỗi 5 s nếu không có khung. Luồng camera được kéo khi LCD ở trang Camera **hoặc** có phiên xem từ xa; chỉ giải nén khi LCD xem. Trang Camera hiện nhãn "Đang được xem từ xa" (chấm đỏ, nền đen mờ) ở góc trên trái khung hình khi có phiên. Cần Gateway có giờ (ký `X-Timestamp`) và `cloud/api_url` hợp lệ.

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
| Có hình nhưng giật | Xem log 5 s: `gw_camera_live: rx` (camera gửi bao nhiêu khung/s) so với `gw_live_view: shown … decode avg … ms`. Nhận ít → camera/WiFi Local AP là nút cổ chai (QVGA, hoặc tăng `CONFIG_GW_CAMERA_LIVE_QUALITY`). Nhận nhiều mà hiển thị ít → bộ giải nén; thử `GW_UI_JPEG_TJPGD` để so sánh |
| `gw_jpeg: decoder scale … failed … using full-size decode` | `scale` của `esp_new_jpeg` không chạy với khung này: ảnh vẫn hiện (giải nén nguyên kích thước + co điểm gần nhất) nhưng chậm hơn — báo lại để chỉnh |
| Xem từ xa: `server rejected the relay session: HTTP 400/401/403/404` | 400 thiếu/sai header · 401 sai chữ ký/lệch giờ hoặc gateway bị khoá · 403 thiết bị không active · 404 camera không thuộc gateway này hoặc phiên không tồn tại. Gateway không nối lại (chờ `live_start` mới) |
| Xem từ xa: `server busy … HTTP 409/429 — will retry` | 409 uplink cũ của cùng phiên còn được coi là sống (≤ ~3 s sau khi rớt), 429 quá 30 lần upgrade/phút/IP: bình thường, Gateway nối lại sau 1, 2, 4 s với ts + chữ ký mới; hết 3 lần thì dừng phiên |
| Xem từ xa: `relay connection lost — retry` liên tục | Server/nginx không nâng cấp WebSocket cho `/api/device/camera/live`, hoặc cert không khớp host trong `cloud/api_url` |
| Chạm màn hình không có tác dụng | Cảm ứng tắt (`CONFIG_EXAMPLE_LCD_TOUCH_CONTROLLER_GT911` = 0 trong `lvgl_port.h`); log có `gw_ui: touch is off` |
| Reset liên tục ngay sau "Initialize touch controller GT911" | GT911 không trả lời (cáp màn hình, board khác đời): code ví dụ dừng bằng `ESP_ERROR_CHECK`. Tạm đặt macro trên = 0 để chạy không cảm ứng |

## Việc còn lại

1. ~~Font tiếng Việt có dấu~~ — xong 2026-11-09: `ui/fonts/gw_font_vi_16/20/24.c` (Montserrat Medium + biểu tượng LVGL, chỉ ASCII + `°` + 134 chữ cái tiếng Việt), sinh lại bằng `bash components/ui/fonts/gen_fonts.sh` (cần Node.js, npx tải `lv_font_conv@1.5.2`). Thêm ký tự mới (VD `…`, `₫`) thì sửa script rồi chạy lại.
2. Ghép nối ECDH + PMK chung (WiFi Provisioning §9) thay cho nạp tay `nodes/*` — bỏ hẳn nhu cầu `GET /api/device/sensors`.
3. Backend: `POST /api/device/camera/snapshot`, subscribe `heartbeat` và `camera/event`, chốt chuỗi ký (API_DESIGN §14 Q2), thêm action `snapshot` vào `DeviceAction`.
4. Đo trên board (mục tiêu 12–15 khung/s): fps nhận / hiển thị / relay, ms giải nén (log 5 s). `esp_new_jpeg` + pipeline tách task đã làm 2026-11-13, **chưa chạy trên board**. Xem từ xa trên web user cần Backend có WebSocket `/api/device/camera/live` (làm song song); Mobile ngoài phạm vi đợt này.
5. Đệm thẻ TF khi mất Internet (§7, §10 Q3), OTA, `factory_reset` có xác nhận 2 bước trên màn hình.
6. Production: NVS Encryption, Flash Encryption + Secure Boot v2 (đốt eFuse — làm khi ổn định), ACL Mosquitto theo gateway.

## Kiểm tra

2026-11-07, ESP-IDF 5.4.4, `idf.py build` với thư mục build và sdkconfig riêng (sinh từ `sdkconfig.defaults`), component manager dùng thư viện có sẵn trong `components/`:

| Kiểm | Kết quả |
|---|---|
| Biên dịch 22 file của gateway + `common/` (build sạch, thêm `gw_camera_live.c`, `gw_jpeg.c`) — 2026-11-07, trước đợt đổi bộ giải nén | 0 lỗi, 0 cảnh báo (cả log build) |
| Ảnh firmware | `gateway_s3.bin` 0x1605B0 byte (~1,38 MB, có font 40 + cảm ứng — 2026-11-08), slot OTA 6 MB còn trống 77% |
| TJpgDec ROM | `jd_prepare` = 0x40000858, `jd_decomp` = 0x40000864 (ROM ESP32-S3, không tốn flash) |
| Bảng phân vùng | Vừa 16 MB, app đầu ở 0x20000 |
| Chưa có `certs/mqtt_ca.crt` | CMake cảnh báo, vẫn build; lúc chạy từ chối `mqtts://` |

**Kiểm tra 2026-11-13** (pipeline tách task + `esp_new_jpeg` 1.0.2 + `gw_camera_relay`; `idf.py -B build_check -D SDKCONFIG=build_check/sdkconfig`, sdkconfig sinh mới từ `sdkconfig.defaults`): build sạch, 0 cảnh báo trong code dự án. `gateway_s3.bin` 0x157C10 byte (~1,41 MB; trước đó 0x1605B0 ở ghi chú 2026-11-08, bản `build/` của người dùng 1,32 MB), slot OTA 6 MB còn trống 78%. DIRAM 44%, IRAM 16 KB cố định đầy như mọi bản S3 (phần text tràn sang DIRAM). Build lại với `CONFIG_GW_UI_JPEG_TJPGD=y` (dự phòng TJpgDec): cũng sạch, 0x1457A0 byte. Chưa chạy trên board.

**Chưa làm:** nạp lên board, chạy với Node/Camera/Server thật, đo RAM/PSRAM lúc chạy (LCD RGB + WiFi AP+STA + 2 phiên TLS + ~1,5 MB bộ đệm ảnh camera), đo số khung/giây thật của xem trực tiếp. `gw_display_backlight` chưa có chỗ gọi nên chưa được link (để dành cho tắt màn hình).
