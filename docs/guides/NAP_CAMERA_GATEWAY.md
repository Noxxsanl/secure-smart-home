# NAP_CAMERA_GATEWAY.md

> **Chuẩn bị và nạp ESP32-CAM + Gateway S3 để xem hình camera trên màn hình Gateway**
> Từng bước từ board trắng tới lúc màn hình Gateway hiện ảnh chụp và hình trực tiếp từ camera cửa. Thiết kế đường hình: [IOT_NODE_NETWORK](../firmware/IOT_NODE_NETWORK.md) §5.2, §5.4. Lệnh ESP-IDF chung (cài đặt, mở terminal, tìm cổng COM): [ESP_IDF_BUILD](ESP_IDF_BUILD.md).

| | |
|---|---|
| **Firmware** | Gateway: `firmware/ESP32-S3-Touch-LCD-4.3B-BOX-Demo/ESP-IDF/08_lvgl_Porting` · Camera: `firmware/esp32_cam` |
| **Hiện trạng** | Cả hai đã build đạt bằng ESP-IDF 5.4.4 (2026-11-07), **chưa nạp lên board thật**. Lần chạy đầu có thể còn lỗi: giữ log `idf.py monitor` của cả hai board để dò |
| **Phạm vi** | Chỉ đường Camera → Gateway (ảnh chụp + xem trực tiếp trên LCD). Đưa ảnh/telemetry lên Server cần thêm phần ở mục 8 |
| **Ngày viết** | 2026-11-08 |

---

## MỤC LỤC

1. [Cần có](#1-cần-có)
2. [Đọc MAC của hai board](#2-đọc-mac-của-hai-board)
3. [Chuẩn bị các giá trị dùng chung](#3-chuẩn-bị-các-giá-trị-dùng-chung)
4. [Viết `nvs_dev.csv` cho hai board](#4-viết-nvs_devcsv-cho-hai-board)
5. [Build và nạp Gateway](#5-build-và-nạp-gateway)
6. [Build và nạp Camera](#6-build-và-nạp-camera)
7. [Kiểm tra kết quả](#7-kiểm-tra-kết-quả)
8. [Khi muốn lên Server](#8-khi-muốn-lên-server)
9. [Xử lý sự cố](#9-xử-lý-sự-cố)

---

## 1. Cần có

| Hạng mục | Ghi chú |
|---|---|
| Gateway Waveshare ESP32-S3-Touch-LCD-4.3B-BOX | Cáp USB-C có dây dữ liệu (log qua USB Serial/JTAG) |
| ESP32-CAM AI-Thinker + đế **ESP32-CAM-MB** | Hoặc USB-TTL: nối GPIO0 xuống GND khi nạp, rút ra rồi reset để chạy |
| Nguồn 5 V ≥ 2 A cho camera | Nguồn yếu → reset liên tục (`Brownout detector was triggered`). Không tắt brownout |
| Router WiFi **2.4 GHz có Internet** | **Bắt buộc ở lần chạy đầu**: Gateway lấy giờ qua NTP rồi ghi vào RTC. Không có giờ thì không ký/kiểm được HMAC, camera không gửi được hình |
| *(Tuỳ chọn)* PIR HC-SR501 | Nối GPIO13 của camera. Không có PIR vẫn xem được hình trực tiếp (mục 7) |
| Máy tính | ESP-IDF 5.4.4, mở terminal **ESP-IDF 5.4 PowerShell** ([ESP_IDF_BUILD](ESP_IDF_BUILD.md) §1.2). Lần build camera đầu tiên cần Internet để tải `espressif/esp32-camera` |

Tìm cổng COM của từng board trong Device Manager ([ESP_IDF_BUILD](ESP_IDF_BUILD.md) §6.1). Tài liệu này dùng **COM5 = Gateway**, **COM6 = Camera**, đổi theo máy (Gateway hiện "USB Serial Device", đế ESP32-CAM-MB hiện "USB-SERIAL CH340").

> **Lệnh trong tài liệu viết cho PowerShell** (dấu nhắc `PS E:\...>`). Dùng **ESP-IDF 5.4 CMD** (dấu nhắc `E:\...>`) thì đổi `$env:IDF_PATH` → `%IDF_PATH%` và `Remove-Item` → `del`. Gõ `$env:IDF_PATH` trong cmd sẽ báo `can't open file '...\$env:IDF_PATH\...'`.

---

## 2. Đọc MAC của hai board

Mỗi bên phải biết MAC **Station** của bên kia: ESP-NOW chỉ nhận gói từ MAC đã ghép, còn Gateway dùng MAC camera để tìm IP camera trên Local AP. Trên ESP32 và ESP32-S3, MAC in ra bởi `read_mac` chính là MAC Station.

```powershell
python -m esptool --chip esp32s3 -p COM5 read_mac    # Gateway
python -m esptool --chip esp32   -p COM6 read_mac    # Camera (đế MB tự vào chế độ nạp)
```

Ghi lại dòng `MAC: xx:xx:xx:xx:xx:xx` của từng board. Cách khác cho Gateway: sau khi nạp, log khởi động in `gateway STA MAC xx:xx:...`.

---

## 3. Chuẩn bị các giá trị dùng chung

Điền bảng này **trước** khi viết file NVS. Mỗi giá trị xuất hiện ở hai nơi phải **giống hệt nhau**.

| Giá trị | Lấy ở đâu | Gateway (`nvs_dev.csv`) | Camera (`nvs_dev.csv`) |
|---|---|---|---|
| ID + secret Gateway | Backend lúc tạo thiết bị gateway (secret chỉ trả 1 lần), hoặc tự đặt khi chỉ thử cục bộ | `identity/device_uuid`, `identity/device_secret` | — |
| ID + secret Camera | Như trên, cho thiết bị camera | `nodes/0_id`, `nodes/0_secret` | `identity/device_uuid`, `identity/device_secret` |
| MAC Camera | Mục 2 | `nodes/0_mac` | — |
| MAC Gateway | Mục 2 | — | `pairing/gateway_mac` |
| LMK ESP-NOW (16 byte = 32 hex) | Sinh ngẫu nhiên (dưới đây) | `nodes/0_lmk` | `pairing/session_key` |
| SSID + mật khẩu Local AP | Tự đặt, mật khẩu ≥ 8 ký tự | `local_ap/ssid`, `local_ap/password` | `wifi/ssid`, `wifi/password` |
| WiFi router | Router của nhà | `wifi/ssid`, `wifi/password` | — (camera **không** biết WiFi nhà) |

Quy định định dạng:

- ID: chỉ `A-Z a-z 0-9 _ -`, tối đa 64 ký tự (UUID của backend hợp lệ). Secret tối đa 128 ký tự.
- MAC: dạng `AA:BB:CC:DD:EE:FF` (hoa hay thường đều được).
- LMK: đúng 32 ký tự hex, không được toàn số 0.
- **Phải tự đặt `local_ap`.** Bỏ trống thì Gateway tự sinh mật khẩu và không in ra (bất biến 2), camera sẽ không vào được.

Sinh LMK và secret thử cục bộ bằng bộ sinh số ngẫu nhiên mật mã (PowerShell):

```powershell
function New-Hex([int]$bytes) {
    $b = New-Object byte[] $bytes
    [Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($b)
    -join ($b | ForEach-Object { $_.ToString('x2') })
}
New-Hex 16    # LMK: 32 ký tự hex
New-Hex 32    # secret thử cục bộ: 64 ký tự hex
New-Hex 8     # mật khẩu Local AP: 16 ký tự
```

Hoặc Git Bash: `openssl rand -hex 16`. Dán kết quả thẳng vào `nvs_dev.csv`. Không gửi secret qua chat, ảnh chụp màn hình hay commit.

> **Thử cục bộ với ID/secret tự đặt** được, vì đường Camera → Gateway không hỏi backend. Khi nối Server phải thay bằng thiết bị tạo trên backend (mục 8).

---

## 4. Viết `nvs_dev.csv` cho hai board

`nvs_*.csv` và `nvs_*.bin` trong `firmware/` đã bị `.gitignore`. Kiểm lại trước khi commit bất cứ thứ gì: `git status` không được có `nvs_dev.csv`.

Giá trị có dấu phẩy (VD mật khẩu WiFi) thì bọc trong dấu nháy kép `"..."`.

### 4.1. Gateway

Chép `08_lvgl_Porting/nvs_dev.csv.example` thành `nvs_dev.csv`. Chưa có Node phòng khách thì chỉ khai 1 thiết bị là camera ở chỉ số 0:

```csv 
key,type,encoding,value
identity,namespace,,
device_uuid,data,string,<ID_GATEWAY>
device_secret,data,string,<SECRET_GATEWAY>
wifi,namespace,,
ssid,data,string,<SSID_ROUTER>
password,data,string,<MAT_KHAU_ROUTER>
local_ap,namespace,,
ssid,data,string,SH-GW-LOCAL
password,data,string,<MAT_KHAU_LOCAL_AP>
cloud,namespace,,
mqtt_uri,data,string,mqtts://192.168.1.100:8883
api_url,data,string,https://192.168.1.100
nodes,namespace,,
count,data,u8,1
0_kind,data,string,camera
0_id,data,string,<ID_CAMERA>
0_secret,data,string,<SECRET_CAMERA>
0_mac,data,string,<MAC_CAMERA>
0_lmk,data,string,<LMK>
```

Có thêm Node phòng khách thì tăng `count` và thêm nhóm `1_kind=node`, `1_id`, `1_secret`, `1_mac`, `1_lmk` (xem `nvs_dev.csv.example`). Nhóm `cloud` chỉ dùng khi lên Server; để mặc định cũng không ảnh hưởng đường camera.

### 4.2. Camera

Chép `esp32_cam/nvs_dev.csv.example` thành `nvs_dev.csv`:

```csv
key,type,encoding,value
identity,namespace,,
device_uuid,data,string,<ID_CAMERA>
device_secret,data,string,<SECRET_CAMERA>
wifi,namespace,,
ssid,data,string,SH-GW-LOCAL
password,data,string,<MAT_KHAU_LOCAL_AP>
pairing,namespace,,
gateway_mac,data,string,<MAC_GATEWAY>
session_key,data,string,<LMK>
```

### 4.3. Đối chiếu trước khi nạp

| Kiểm | Gateway | Camera |
|---|---|---|
| ID camera | `0_id` | `device_uuid` |
| Secret camera | `0_secret` | `device_secret` |
| LMK | `0_lmk` | `session_key` |
| Local AP | `local_ap/ssid`, `password` | `wifi/ssid`, `password` |
| MAC | `0_mac` = MAC **camera** | `gateway_mac` = MAC **Gateway** |

Sai bất kỳ cặp nào thì hình không tới — mục 9 liệt kê dấu hiệu của từng trường hợp.

---

## 5. Build và nạp Gateway

Trong **ESP-IDF 5.4 PowerShell**:

```powershell
cd E:\WorkSpace\secure-smart-home-iot\firmware\ESP32-S3-Touch-LCD-4.3B-BOX-Demo\ESP-IDF\08_lvgl_Porting

# 1. Sinh lại sdkconfig: bản đang có là của ví dụ Waveshare (1 phân vùng app, thiếu menu "Gateway S3: services")
Remove-Item sdkconfig, sdkconfig.old -ErrorAction SilentlyContinue
idf.py set-target esp32s3            # sinh sdkconfig từ sdkconfig.defaults, xoá build/

# 2. (Tuỳ chọn) chỉnh luồng camera: menuconfig → "Gateway S3: services"
#    Trang khởi động, độ phân giải luồng (VGA / QVGA), chất lượng JPEG, chuyển sang trang Camera khi có chuyển động
idf.py menuconfig

# 3. Build
idf.py build

# 4. Lần đầu: xoá sạch flash (board đang chứa demo Waveshare). Thao tác này xoá MỌI dữ liệu trên Gateway.
idf.py -p COM5 erase-flash

# 5. Nạp firmware (ghi bảng phân vùng mới) — TRƯỚC khi ghi NVS
idf.py -p COM5 flash

# 6. Ghi NVS (phân vùng 24K = 0x6000), rồi xoá file .bin chứa secret.
#    BẮT BUỘC: idf.py build/flash KHÔNG nạp nvs_dev.csv — thiếu bước này màn hình báo "Gateway chưa được cấp phát".
#    Chỉ cần làm lại khi đổi nvs_dev.csv hoặc sau erase-flash; nạp lại firmware không xoá NVS.
python $env:IDF_PATH\components\nvs_flash\nvs_partition_generator\nvs_partition_gen.py generate nvs_dev.csv nvs_dev.bin 0x6000
python $env:IDF_PATH\components\partition_table\parttool.py -p COM5 write_partition --partition-name=nvs --input nvs_dev.bin
Remove-Item nvs_dev.bin

# 7. Xem log (Ctrl+] để thoát)
idf.py -p COM5 monitor
```

Log đúng (thứ tự có thể khác):

```
I (...) gw_display: LCD 800x480 ready, touch off
I (...) gw_config: gateway_id=<id> wifi=<ssid router> local_ap=SH-GW-LOCAL ...
I (...) gw_registry: camera <ID_CAMERA> mac=<MAC_CAMERA> lmk=set
I (...) gw_wifi: local AP "SH-GW-LOCAL" on channel 1; gateway STA MAC <MAC_GATEWAY> ...
I (...) gw_espnow: ESP-NOW ready on channel 1
I (...) gw_local_http: local HTTP server on :80 (POST /local/camera/snapshot)
I (...) gw_camera_live: ready (GET /stream?fs=vga&q=12)
I (...) gw_wifi: router connected, ip=192.168.1.x, channel 6
I (...) gw_time: time synced from NTP: 1762...
```

- `MAC_GATEWAY` trong log phải trùng `pairing/gateway_mac` của camera.
- Nối router xong, Local AP và ESP-NOW chuyển sang kênh của router: camera rớt kết nối một lúc rồi tự nối lại, bình thường.
- Không có `certs/mqtt_ca.crt` thì CMake cảnh báo và màn hình báo lỗi Server — không ảnh hưởng đường camera.
- Đổi `sdkconfig.defaults` sau này thì phải xoá `sdkconfig` và chạy lại `set-target`.

---

## 6. Build và nạp Camera

```powershell
cd E:\WorkSpace\secure-smart-home-iot\firmware\esp32_cam

# sdkconfig hiện có đã sinh từ sdkconfig.defaults. Báo "app partition is too small" thì sinh lại:
#   Remove-Item sdkconfig; idf.py set-target esp32
idf.py build                          # lần đầu tải esp32-camera vào managed_components/

idf.py -p COM6 flash                  # USB-TTL: GPIO0 xuống GND, reset, nạp xong rút GPIO0 rồi reset

# NVS camera 16K = 0x4000
python $env:IDF_PATH\components\nvs_flash\nvs_partition_generator\nvs_partition_gen.py generate nvs_dev.csv nvs_dev.bin 0x4000
python $env:IDF_PATH\components\partition_table\parttool.py -p COM6 write_partition --partition-name=nvs --input nvs_dev.bin
Remove-Item nvs_dev.bin               # bước NVS bắt buộc — idf.py flash không nạp nvs_dev.csv

idf.py -p COM6 monitor
```

Log đúng:

```
I (...) cam_led: flash LED GPIO4: on 100 ms every 1000 ms, brightness 20%
I (...) cam_config: device_id=<ID_CAMERA> local_ap=SH-GW-LOCAL gateway_mac=set lmk=set
I (...) cam_camera: OV2640 ready (SVGA, q=12)
I (...) cam_wifi: connected, ip=192.168.4.x gateway=192.168.4.1
I (...) cam_espnow: ESP-NOW ready, gateway <MAC_GATEWAY> (encrypted)
I (...) cam_time: time synced from gateway: 1762...
I (...) cam_app: ready
```

Đèn flash GPIO4 nháy ngắn mỗi giây ngay khi firmware chạy, kể cả lúc chưa nạp NVS — không nháy nghĩa là firmware chưa chạy (sai chế độ nạp, nguồn yếu). Chỉnh/tắt ở menuconfig → *ESP32-CAM: drivers* (`Nháy đèn flash theo chu kỳ`, chu kỳ, thời gian sáng, độ sáng).

Dòng `time synced from gateway` là điều kiện để mọi thứ phía sau chạy. Không thấy dòng này thì xem mục 9 trước khi đi tiếp.

Để menuconfig của camera ở mặc định: **không** bật `[DEV] Cho ESP-NOW không mã hoá` và để trống `[DEV] Máy chủ SNTP` (Local AP không có Internet).

---

## 7. Kiểm tra kết quả

Bật Gateway trước (để có giờ NTP), rồi bật camera.

| # | Kiểm | Dấu hiệu đạt |
|---|---|---|
| 1 | Camera vào Local AP | Gateway: `local AP: client <MAC_CAMERA> joined`; bảng **THIẾT BỊ** trên màn hình: chấm của camera **xanh** (ý nghĩa 3 màu: [MAN_HINH_GATEWAY](MAN_HINH_GATEWAY.md) §2.2) |
| 2 | Camera có giờ | Camera: `cam_time: time synced from gateway` |
| 3 | Xem trực tiếp | Gateway khởi động ở trang **Camera** (thanh nav bên trái). Vài giây sau khi camera vào Local AP: log `gw_app: live view <ID_CAMERA> (camera page)` rồi `gw_camera_live: streaming from camera <ID_CAMERA>`; góc trên phải hiện "Trực tiếp" và số khung/giây (~3 khung/s ở VGA); camera log `stream started (vga, q=12)`. Chấm ở góc phải hàng tiêu đề: **xanh** "Đã kết nối" (kèm khung/s), **vàng** đang kết nối, **đỏ** mất kết nối. Tắt camera thì khung hình hiện "Chờ camera...", bật lại thì tự nối lại |
| 4 | Ảnh chụp do chuyển động | Đợi 30 s sau khi camera bật nguồn (PIR khởi động), vẫy tay trước PIR. Không có PIR: nối tạm GPIO13 của camera lên chân 3V3 bằng dây rồi rút ra. Camera: `snapshot sent (… bytes, motion)`; Gateway: `snapshot from <ID_CAMERA>: … bytes (motion)` (ảnh chỉ đẩy lên Server, không hiện trên màn hình) |
| 5 | Chạm nav | Chạm **PHÒNG KHÁCH** / **THIẾT BỊ**: đổi trang ngay, luồng camera dừng (camera log `stream ended: N frames in M s`); chạm **CAMERA**: luồng chạy lại. Đang ở trang khác mà có chuyển động: tự về trang Camera, 30 s sau quay lại trang cũ |

Ghi lại số khung/giây đo được (mục tiêu 10 khung/s, IOT_NODE_NETWORK §5.4). Giật quá thì menuconfig → *Gateway S3: services* → chọn **QVGA**, hoặc tăng `Chất lượng JPEG của luồng` (số lớn hơn = khung nhẹ hơn).

**Cảm ứng** đang bật (`CONFIG_EXAMPLE_LCD_TOUCH_CONTROLLER_GT911` = `1` trong `components/drivers/src/lcd/lvgl_port.h`) để dùng thanh nav. Nếu Gateway reset liên tục ngay sau dòng log `Initialize touch controller GT911` thì GT911 không trả lời — đặt tạm macro về `0` (chỉ còn trang khởi động, chọn trong menuconfig → `Trang hiện khi khởi động`). Bố cục màn hình: [README Gateway](../../firmware/ESP32-S3-Touch-LCD-4.3B-BOX-Demo/ESP-IDF/08_lvgl_Porting/README.md), mục *Giao diện và xem trực tiếp*.

Thử nhận ảnh khi chưa có camera (laptop nối Local AP, gửi JPEG có chữ ký): [README Gateway](../../firmware/ESP32-S3-Touch-LCD-4.3B-BOX-Demo/ESP-IDF/08_lvgl_Porting/README.md), mục *Thử từng chặng*. Thử luồng camera khi chưa có Gateway: [README Camera](../../firmware/esp32_cam/README.md), mục *Thử luồng khi chưa có Gateway*.

---

## 8. Khi muốn lên Server

Đường Camera → Gateway không cần Server. Muốn Gateway gửi telemetry/ảnh lên Server thì thêm:

1. Tạo thiết bị gateway và camera trên backend, thay ID/secret tự đặt bằng giá trị backend trả (secret chỉ trả **1 lần**, bất biến 1). Camera phải được gán vào gateway này.
2. Chép CA của Broker 2: `infra\mosquitto\certs\ca.crt` → `08_lvgl_Porting\certs\mqtt_ca.crt` (thư mục `certs/` đã bị gitignore), build và nạp lại Gateway ([MQTT_TLS](MQTT_TLS.md), [ESP_IDF_BUILD](ESP_IDF_BUILD.md) §7.2).
3. Sửa `cloud/mqtt_uri`, `cloud/api_url` theo IP máy chủ. Host trong `mqtt_uri` phải nằm trong SAN của chứng chỉ broker.
4. Sinh lại và ghi NVS cho **cả hai** board (mục 4–6).

Hiện backend **chưa có** `POST /api/device/camera/snapshot` và chưa subscribe `camera/event`, nên ảnh chỉ hiện trên Gateway, chưa lên Mobile/Dashboard ([README Gateway](../../firmware/ESP32-S3-Touch-LCD-4.3B-BOX-Demo/ESP-IDF/08_lvgl_Porting/README.md), mục *Hợp đồng với Server*).

---

## 9. Xử lý sự cố

| Hiện tượng | Nguyên nhân thường gặp | Cách xử lý |
|---|---|---|
| Gateway vẫn chạy demo cũ, hoặc `app partition is too small` | Dùng `sdkconfig` cũ của ví dụ Waveshare | Mục 5 bước 1 |
| Màn hình "Gateway chưa được cấp phát" (thanh trên "Mất kết nối") | Mới `idf.py build` + `flash` mà chưa chạy bước ghi NVS — `flash` không nạp `nvs_dev.csv`; hoặc sai tên namespace/key | Chạy mục 5 bước 6 (`nvs_partition_gen` + `parttool write_partition`), so `nvs_dev.csv` với mục 4.1 |
| Camera log `not provisioned` | Chưa ghi NVS camera | Mục 6 |
| Camera reset liên tục, `Brownout detector was triggered` | Nguồn 5 V yếu | Adapter ≥ 2 A, dây ngắn, tụ lọc gần chân nguồn |
| `camera init failed: ESP_ERR_NOT_FOUND` | Cáp camera lỏng, module không phải AI-Thinker | Cắm lại cáp OV2640 |
| Camera không vào được Local AP | `wifi/password` camera khác `local_ap/password` Gateway, hoặc Gateway thiếu `local_ap` (tự sinh mật khẩu) | Mục 4.3, đặt `local_ap` rõ ràng |
| Gateway log `RTC has no valid time — waiting for NTP` mà không bao giờ có `time synced from NTP`; camera không có giờ | Gateway chưa vào được router / router không có Internet, RTC chưa từng đặt giờ | Kiểm `wifi/ssid`, `password` của Gateway; router phải 2.4 GHz và có Internet |
| Camera log `refusing unencrypted ESP-NOW` | Thiếu `pairing/session_key` | Mục 4.2 |
| Camera không có dòng `time synced from gateway` dù đã vào Local AP | `gateway_mac` không phải MAC Station Gateway, hoặc LMK hai bên khác nhau, hoặc `0_mac` sai | Mục 2, 4.3 |
| Màn hình Gateway: "Camera chưa vào Local AP" | Camera chưa nối Local AP, hoặc `nodes/0_mac` không phải MAC camera | Mục 2, 4.3 |
| Màn hình Gateway: "Camera chưa có giờ: kiểm tra ghép nối ESP-NOW" (camera trả 503) | Như dòng trên | Mục 2, 4.3 |
| Màn hình Gateway: "Camera từ chối chữ ký" (401); hoặc Gateway log `reject snapshot … bad signature` | `0_secret` (Gateway) khác `device_secret` (camera), hoặc giờ hai bên lệch > 300 s | Mục 4.3 |
| Màn hình Gateway: "Camera đang phát cho kết nối khác" (409) | Luồng cũ chưa đóng hẳn | Đợi vài giây; vẫn bị thì reset camera |
| Có hình nhưng giật (< 3 khung/s) | Giải nén JPEG bằng phần mềm trên S3 | Mục 7: QVGA hoặc tăng chất lượng JPEG |
| `parttool.py` báo không đọc được bảng phân vùng / không thấy `nvs` | Ghi NVS khi board chưa có bảng phân vùng mới (VD vừa `erase-flash`) | Nạp firmware trước (mục 5 bước 5), rồi mới ghi NVS |

Vẫn không được: gửi log `idf.py monitor` của **cả hai** board từ lúc khởi động, cùng dòng chữ cuối màn hình Gateway. Log không chứa secret/mật khẩu (firmware không in ra), nhưng vẫn kiểm trước khi gửi.
