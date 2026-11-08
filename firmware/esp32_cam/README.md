# ESP32-CAM — camera cửa (bản sơ bộ)

Firmware ESP-IDF v5.4.4 cho ESP32-CAM AI-Thinker (OV2640, PSRAM 4 MB). Camera chỉ nối **Local AP của Gateway**, không bao giờ biết WiFi thật của nhà.

Thiết kế: [IOT_NODE_NETWORK](../../docs/firmware/IOT_NODE_NETWORK.md) §4.2, §5.2, §5.4, §6.2. Hợp đồng: [API_DESIGN](../../docs/API_DESIGN.md) §10.2, §10.3, §11. Lệnh build/nạp chi tiết: [ESP_IDF_BUILD](../../docs/guides/ESP_IDF_BUILD.md) §2.3. Từng bước chuẩn bị + nạp cùng Gateway để xem hình trên màn hình Gateway: [NAP_CAMERA_GATEWAY](../../docs/guides/NAP_CAMERA_GATEWAY.md).

> **Đã build, chưa chạy trên board.** `idf.py build` (ESP-IDF 5.4.4, 2026-11-07) đạt, không cảnh báo trong code dự án; `esp32_cam.bin` 0x110590 byte (~1,07 MB), còn trống 43% slot OTA 1920K. Chưa nạp lên ESP32-CAM. Phía Gateway S3 (`firmware/ESP32-S3-Touch-LCD-4.3B-BOX-Demo/ESP-IDF/08_lvgl_Porting`) đã có code nhận ảnh `/local/camera/snapshot` (hiện thu nhỏ trên màn hình), ESP-NOW, và kéo `GET /stream` để xem trực tiếp trên LCD — cũng mới build, chưa nạp, nên luồng đầu-cuối chưa kiểm trên board.

## Đã có / chưa có

| Chức năng | Trạng thái | File |
|---|---|---|
| Khởi tạo OV2640, SVGA, JPEG q=12, 2 bộ đệm PSRAM, `GRAB_LATEST` | Có | `drivers/src/cam_camera.c` |
| PIR GPIO13: bỏ qua 30 s đầu, nghỉ 10 s giữa 2 sự kiện | Có | `drivers/src/cam_pir.c` |
| Đèn flash GPIO4 nháy báo board đang chạy: sáng 100 ms mỗi 1 s, độ sáng 20 % (PWM LEDC timer 1/kênh 1) | Có — chỉnh/tắt ở menu *ESP32-CAM: drivers* | `drivers/src/cam_led.c` |
| Đọc identity, Local AP, MAC Gateway, LMK từ NVS | Có | `services/src/cam_config.c` |
| WiFi STA vào Local AP, WPA2 trở lên, tự nối lại (1 → 30 s) | Có | `services/src/cam_wifi.c` |
| ESP-NOW: PING, HEARTBEAT 30 s, EVENT motion, CMD `snapshot`, CMD_ACK, TIME_SYNC | Có, mã `type` là **đề xuất** | `services/src/cam_espnow.c`, `../common/espnow_proto` |
| Gửi ảnh `POST /local/camera/snapshot` có HMAC, ≤ 200 KB | Có | `services/src/cam_snapshot.c` |
| `GET /stream` MJPEG, kiểm HMAC ±300 s, 1 luồng (409), VGA/QVGA | Có | `services/src/cam_stream.c` |
| Nối sự kiện: chuyển động → EVENT + chụp; lệnh → chụp → CMD_ACK | Có | `application/src/cam_app.c` |
| HMAC dùng chung `HMAC-SHA256(secret, "<device_id>:<unix_ts>")` | Có | `../common/security_manager` |
| Ghép nối ECDH (`PAIR_*`), nhận LMK + Local AP qua ESP-NOW | **Chưa**: đang nạp tay qua NVS | — |
| PMK ESP-NOW chung | **Chưa**: dùng PMK mặc định của ESP-IDF | — |
| Đèn flash bật khi chụp trong tối, LED báo lỗi (nháy kiểu khác khi mất kết nối) | **Chưa** | — |
| Giữ ảnh khi mất Gateway, gửi lại sau | **Chưa** | — |
| OTA, NVS Encryption | **Chưa** (bảng phân vùng đã có 2 slot OTA) | — |

Đường dẫn trong bảng tính từ `components/`.

## Cấu trúc

```
esp32_cam/
├── CMakeLists.txt               # project; trỏ thêm ../common bằng EXTRA_COMPONENT_DIRS
├── main/
│   ├── CMakeLists.txt           # PRIV_REQUIRES application
│   └── main.c                   # app_main() → cam_app_start()
├── components/
│   ├── drivers/                 # phần cứng: OV2640, PIR, đèn flash GPIO4
│   │   ├── CMakeLists.txt
│   │   ├── Kconfig.projbuild    # menu "ESP32-CAM: drivers" (GPIO PIR, chất lượng JPEG, nháy đèn flash…)
│   │   ├── idf_component.yml    # espressif/esp32-camera ^2.0.0 (require: public)
│   │   ├── include/             # cam_camera.h, cam_pir.h, cam_led.h
│   │   └── src/
│   ├── services/                # NVS, đồng hồ, WiFi Local AP, ESP-NOW, gửi ảnh, luồng MJPEG
│   │   ├── CMakeLists.txt
│   │   ├── Kconfig.projbuild    # menu "ESP32-CAM: services" (heartbeat, fps, tuỳ chọn DEV…)
│   │   ├── include/             # cam_config.h, cam_time.h, cam_wifi.h, cam_espnow.h, cam_snapshot.h, cam_stream.h
│   │   └── src/
│   └── application/             # luồng nghiệp vụ camera cửa: nối drivers ↔ services
│       ├── CMakeLists.txt
│       ├── include/cam_app.h
│       └── src/cam_app.c
├── sdkconfig                    # sinh tự động từ sdkconfig.defaults — gitignore
├── sdkconfig.defaults           # commit; KHÔNG chứa SSID/mật khẩu/secret
├── partitions_node.csv          # nvs 16K, otadata, phy, ota_0/ota_1 1920K, log 64K
└── nvs_dev.csv.example          # mẫu; bản thật nvs_dev.csv bị gitignore

../common/                       # dùng chung với Gateway/Node
├── security_manager/            # HMAC thiết bị (sign, verify thời gian hằng, cửa sổ ±300 s)
└── espnow_proto/                # khung ESP-NOW {ver, type, seq, body JSON} ≤ 250 byte
```

**Quy tắc phụ thuộc** (chiều mũi tên = được include):

```
main ──► application ──► services ──► drivers ──► esp32-camera
                    └──────────────►  drivers
                         services ──► common/security_manager, common/espnow_proto
```

- `drivers` không biết `services`/`application`; `services` không biết `application`; `main` chỉ gọi `cam_app_start()`.
- Ép bằng `PRIV_REQUIRES` trong `CMakeLists.txt` của từng component: ESP-IDF chỉ thêm include path của component được khai báo, include sai tầng sẽ báo `No such file`.
- Tầng dưới báo lên tầng trên bằng callback (VD `cam_pir_start(on_motion)`), không gọi ngược.

## Build lần đầu

Mở **ESP-IDF 5.4 PowerShell** (ESP_IDF_BUILD §1.2), rồi:

```powershell
cd E:\WorkSpace\secure-smart-home-iot\firmware\esp32_cam

# sdkconfig cũ được sinh trước khi có sdkconfig.defaults (flash 2 MB, single app) → phải sinh lại
Remove-Item sdkconfig
idf.py set-target esp32      # sinh sdkconfig từ sdkconfig.defaults, xoá build/
idf.py build                 # lần đầu tải espressif/esp32-camera vào managed_components/
```

Commit `components/drivers/idf_component.yml` và `dependencies.lock`; không commit `managed_components/`, `build/`, `sdkconfig`.

## Nạp identity vào NVS (giai đoạn dev)

Chưa có ghép nối, nên nạp tay ([ESP_IDF_BUILD](../../docs/guides/ESP_IDF_BUILD.md) §7.1):

1. Chép `nvs_dev.csv.example` thành `nvs_dev.csv` rồi điền:
   - `device_uuid`, `device_secret`: lấy lúc tạo thiết bị camera trên backend (secret chỉ trả **1 lần**).
   - `ssid`, `password`: Local AP của Gateway. Khi dev chưa có Gateway thì dùng tạm hotspot điện thoại.
   - `gateway_mac`: MAC **Station** của Gateway S3 (`esp_read_mac(..., ESP_MAC_WIFI_STA)`), phải khớp interface Gateway dùng để gửi ESP-NOW.
   - `session_key`: LMK 16 byte = 32 ký tự hex, Gateway phải đặt đúng LMK này cho peer camera.
   - Chưa có Gateway thì xoá 3 dòng `pairing` (ESP-NOW tắt, camera vẫn chạy luồng).
2. Sinh ảnh và ghi vào phân vùng `nvs` (16K = `0x4000`):

```powershell
python $env:IDF_PATH\components\nvs_flash\nvs_partition_generator\nvs_partition_gen.py generate nvs_dev.csv nvs_dev.bin 0x4000
python $env:IDF_PATH\components\partition_table\parttool.py -p COM6 write_partition --partition-name=nvs --input nvs_dev.bin
Remove-Item nvs_dev.bin
```

## Nạp firmware

Đế ESP32-CAM-MB hoặc USB-TTL, GPIO0 xuống GND khi nạp (ESP_IDF_BUILD §2.3 bước 6):

```powershell
idf.py -p COM6 flash monitor
```

Log đúng:

```
I (...) cam_led: flash LED GPIO4: on 100 ms every 1000 ms, brightness 20%
I (...) cam_config: device_id=<id> local_ap=<ssid> gateway_mac=set lmk=set
I (...) cam_camera: OV2640 ready (SVGA, q=12)
I (...) cam_wifi: connected, ip=192.168.4.x gateway=192.168.4.1
I (...) cam_espnow: ESP-NOW ready, gateway aa:bb:cc:dd:ee:ff (encrypted)
I (...) cam_time: time synced from gateway: 1762...
I (...) cam_app: ready
```

## Thử luồng khi chưa có Gateway

Cần camera có giờ để kiểm HMAC. Khi dev dùng hotspot có Internet:

1. `idf.py menuconfig` → *ESP32-CAM: services* → `[DEV] Máy chủ SNTP` = `pool.ntp.org`. Bản demo phải để trống.
2. Từ máy tính nối cùng hotspot (Git Bash, có `openssl`):

```bash
read -rs SECRET                       # nhập secret, không lưu vào history
ID=<device_id>; CAM=<ip-camera>; TS=$(date +%s)
SIG=$(printf '%s' "$ID:$TS" | openssl dgst -sha256 -hmac "$SECRET" | awk '{print $NF}')

# 200 + lưu 5 giây luồng, mở bằng VLC/ffplay
curl -s --max-time 5 -o stream.mjpg -w '%{http_code}\n' \
  -H "X-Device-Id: $ID" -H "X-Timestamp: $TS" -H "X-Signature: $SIG" "http://$CAM/stream?fs=vga&q=12"

# 401 khi sai chữ ký
curl -s -o /dev/null -w '%{http_code}\n' -H "X-Device-Id: $ID" -H "X-Timestamp: $TS" \
  -H "X-Signature: $(printf '0%.0s' {1..64})" "http://$CAM/stream"
```

Mở 2 luồng cùng lúc thì luồng thứ hai nhận `409`.

## Xử lý sự cố

| Hiện tượng | Nguyên nhân thường gặp |
|---|---|
| `camera init failed: ESP_ERR_NOT_FOUND` | Cáp camera lỏng, sai sơ đồ chân (module không phải AI-Thinker) |
| Reset liên tục, `Brownout detector was triggered` | Nguồn 5 V yếu. Dùng adapter ≥ 2 A, tụ lọc. **Không** tắt brownout. Nếu chỉ reset đúng lúc đèn flash nháy: giảm `Độ sáng đèn khi nháy` hoặc tắt `Nháy đèn flash theo chu kỳ` (menu *ESP32-CAM: drivers*) |
| Khung hình/ảnh chụp lúc sáng lúc tối theo nhịp 1 s | Đèn flash nằm cạnh ống kính nên chiếu sáng cảnh mỗi lần nháy. Giảm độ sáng hoặc tắt nháy |
| `not provisioned` | Chưa nạp `nvs_dev.bin`, hoặc sai tên namespace/key |
| `/stream` trả 503 | Camera chưa có giờ: chưa nhận `TIME_SYNC` từ Gateway, hoặc chưa bật SNTP dev |
| Gateway trả 401 cho ảnh | Sai `device_secret`, hoặc giờ camera lệch > 300 s |
| `refusing unencrypted ESP-NOW` | Thiếu `pairing/session_key`. Khi dev có thể bật `[DEV] Cho ESP-NOW không mã hoá` (menu *ESP32-CAM: services*) |

## Điểm cần chốt với Gateway

- Giá trị số của `type` ESP-NOW trong `../common/espnow_proto/include/espnow_proto.h` (docs mới chốt tên).
- Gateway trả `TIME_SYNC` khi nhận `PING` và sau mỗi `HEARTBEAT`.
- `live_start` / `live_stop` do Gateway xử lý (mở/đóng `GET /stream`), camera trả `CMD_ACK error` nếu nhận được. Gateway đã kéo luồng với `fs` và `q` theo menuconfig của nó (mặc định `vga`, `q=12`); cả ảnh chụp lẫn luồng đều cần camera **có giờ** (TIME_SYNC qua ESP-NOW), chưa có thì camera trả `503` và không ký được ảnh.
- Camera gửi `CMD_ACK` cho `snapshot` **sau** khi Gateway trả 201 (thời gian chờ gửi 2,5 s, dưới mốc 3 s Gateway chờ ack).
