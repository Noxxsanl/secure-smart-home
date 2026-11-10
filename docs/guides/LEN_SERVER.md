# LEN_SERVER.md — Đưa dữ liệu phần cứng thật lên Server và giao diện khách

Hướng dẫn nối bộ demo thật (Gateway Waveshare ESP32-S3 `gw-s3-demo-01`, Node phòng khách `node-living-01`, ESP32-CAM
`cam-door-01`) với backend, để **nhiệt độ/độ ẩm** và **ảnh camera khi có chuyển động** hiện trên cổng web khách
(`apps/user`, http://localhost:3003) và app Mobile.

Điều kiện trước: Node → Gateway và Camera → Gateway đã chạy (Gateway log `TELEMETRY node-living-01 verified`, nhận ảnh
`snapshot from cam-door-01`) — xem [NAP_CAMERA_GATEWAY](NAP_CAMERA_GATEWAY.md). Không cần nạp lại Node hay Camera.

## 1. Luồng dữ liệu

```
Node ──ESP-NOW──► Gateway ──MQTT TLS :8883  gateway/<gw>/data ─────────────► Broker 2 ─► backend telemetry ─► sensor_data
                          ──MQTT TLS :8883  home/<h>/gateway/<gw>/heartbeat ─► Broker 2 ─► backend devices (online)
Camera ─HTTP Local AP─►   ──HTTPS :443  POST /api/device/camera/snapshot ──► nginx ─► backend camera ─► camera_snapshots + file
                          ──MQTT TLS :8883  .../device/<cam>/camera/event ──► backend camera ─► thông báo "Phát hiện chuyển động"
Web khách  ◄── /api/portal/devices/:id/snapshots, /api/portal/snapshots/:id/image (cookie sh_user)
Mobile     ◄── /api/mobile/... (Bearer) + WebSocket tin camera_snapshot
```

Mọi chặng Gateway → Server có TLS kiểm chứng bằng CA nội bộ (`infra/pki`) và HMAC gateway (±300 s): telemetry/heartbeat
ký `"<gateway_id>:<ts>"`; ảnh ký `"<gateway_id>:<ts>:<device_id>:<trigger>:<command_id>:<sha256 ảnh>"` để chữ ký nghe lén
trên broker không dùng lại được cho ảnh giả. Firmware gateway đã đổi chuỗi ký này (2026-11-10) — phải build + nạp lại (bước 5). Hợp đồng chi tiết: [API_DESIGN](../API_DESIGN.md).

## 2. Máy chủ và Gateway phải chung mạng

Gateway nối router của nhà (NVS `wifi/ssid`). Máy chạy Docker phải nối **cùng router đó**, rồi lấy IP LAN:

```powershell
ipconfig    # dòng "IPv4 Address" của card Wi-Fi/Ethernet đang nối router — ví dụ 192.168.100.20
```

Gọi IP này là `<IP>` ở các bước dưới. Nên đặt IP tĩnh/DHCP reservation cho máy chủ trên router — đổi IP thì phải làm lại
bước 3 và bước 5 (sửa NVS).

Windows Firewall phải cho vào cổng **8883** (MQTT TLS) và **443** (HTTPS). Docker Desktop thường tự thêm luật; nếu Gateway
báo không kết nối được, thêm luật (PowerShell **Run as Administrator**):

```powershell
New-NetFirewallRule -DisplayName "SmartHome MQTT TLS 8883" -Direction Inbound -Protocol TCP -LocalPort 8883 -Action Allow -Profile Private
New-NetFirewallRule -DisplayName "SmartHome HTTPS 443"     -Direction Inbound -Protocol TCP -LocalPort 443  -Action Allow -Profile Private
```

## 3. Chứng chỉ (một lần cho mỗi IP)

Trong **Git Bash** ở gốc repo:

```bash
bash infra/pki/gen_mqtt_certs.sh <IP>
```

Script dùng lại CA cũ (nếu có), cấp server cert có SAN = `<IP>` (dùng chung cho Broker 2 :8883 và nginx :443), và **chép
CA vào** `firmware/ESP32-S3-Touch-LCD-4.3B-BOX-Demo/ESP-IDF/08_lvgl_Porting/certs/mqtt_ca.crt` (gitignore) để gateway nhúng
lúc build. Không bao giờ chép `ca.key` đi đâu.

## 4. Chạy Server và đăng ký thiết bị thật

```powershell
cd E:\WorkSpace\secure-smart-home-iot
docker compose up -d --build            # lần đầu; đã chạy rồi: docker compose up -d --force-recreate mqtt-broker-2 nginx backend
docker compose logs -f backend          # chờ "[migrate]" xong và "[mqttData] connected"
```

Backend tự tạo bảng mới `camera_snapshots` khi khởi động (migration append-only).

Đăng ký 3 thiết bị **với đúng device_id/secret đã nạp vào chip** (đọc từ `nvs_dev.csv` của gateway — file gitignore, script
không in secret). Chạy trên máy (không trong container, vì container không thấy thư mục firmware); `backend/.env` cần
`DB_HOST=localhost`, `DB_PORT=5433` như [CHAY_LOCAL](CHAY_LOCAL.md):

```powershell
cd backend
npm run hw:register
# tuỳ chọn: npm run hw:register -- --owner user01@smarthome.local --home-name "Nhà demo phần cứng" --nvs <đường dẫn csv>
```

Kết quả mẫu:

```
[hw:register] Đã tạo nhà "Nhà demo phần cứng" (home_id=3, chủ nhà user01@smarthome.local)
  - gw-s3-demo-01  id=31  gateway  phòng: (không)  "Gateway S3"
  - cam-door-01  id=32  camera  phòng: Camera  "Camera"
  - node-living-01  id=33  sensor  phòng: Phòng khách  "Cảm biến nhiệt/ẩm phòng khách"
  - node-living-01-lamp  id=34  relay (mô phỏng)  phòng: Phòng khách  "Đèn phòng khách"
  - node-living-01-fan  id=35  relay (mô phỏng)  phòng: Phòng khách  "Quạt phòng khách"
  - node-living-01-curtain  id=36  relay (mô phỏng)  phòng: Phòng khách  "Rèm cửa phòng khách"
  - node-living-01-ac  id=37  relay (mô phỏng)  phòng: Phòng khách  "Điều hòa phòng khách"
[hw:register] Nhớ ghi cloud/home_id = 3 vào NVS gateway để gửi heartbeat/sự kiện camera.
```

Chạy lại bất cứ lúc nào (idempotent): nhà/phòng dùng lại, thiết bị cập nhật secret theo NVS và được mở khoá (`fail_count = 0`).
Nhà đã đăng ký bằng bản cũ (phòng "Cửa chính" chứa "Camera cửa chính") được đổi thành phòng **Camera** / thiết bị **Camera**
(tên khách đã tự đổi thì giữ nguyên).

Đèn, quạt, rèm, điều hoà của phòng khách là **relay mô phỏng** (`is_simulated = TRUE`): bật/tắt trên web/mobile chạy thật
qua simulator (ack sau ~0,5 s) nhưng **không** gửi gì xuống node, vì firmware node chưa nhận lệnh relay/IR. Rèm dùng
`turn_on` = mở, `turn_off` = đóng; điều hoà mới bật/tắt (nhiệt độ đặt, chế độ chờ lệnh IR). Khi node hỗ trợ lệnh: đặt
`is_simulated = FALSE` cho 4 dòng `<node>-lamp|fan|curtain|ac` (chạy lại script không bật lại mô phỏng).
Thiết bị đã có ở **nhà khác** thì script dừng (không ghi gì) trừ khi thêm `--force`. Script từ chối chạy khi `NODE_ENV=production`.

## 5. Cấu hình lại Gateway

Sửa namespace `cloud` trong `08_lvgl_Porting/nvs_dev.csv` (KHÔNG commit file này):

```csv
cloud,namespace,,
mqtt_uri,data,string,mqtts://<IP>:8883
api_url,data,string,https://<IP>
home_id,data,string,<home_id in ở bước 4>
```

`home_id` là chuỗi chỉ gồm chữ số; thiếu thì Gateway vẫn gửi nhiệt/ẩm và ảnh, nhưng **không** gửi heartbeat và sự kiện
chuyển động (camera hiện "mất kết nối", không có thông báo).

Build lại (để nhúng CA), nạp firmware, rồi ghi lại NVS — mở **ESP-IDF 5.4 CMD/PowerShell**:

```powershell
cd E:\WorkSpace\secure-smart-home-iot\firmware\ESP32-S3-Touch-LCD-4.3B-BOX-Demo\ESP-IDF\08_lvgl_Porting
idf.py build
idf.py -p COM3 flash
python $env:IDF_PATH\components\nvs_flash\nvs_partition_generator\nvs_partition_gen.py generate nvs_dev.csv nvs_dev.bin 0x6000
python $env:IDF_PATH\components\partition_table\parttool.py -p COM3 write_partition --partition-name=nvs --input nvs_dev.bin
Remove-Item nvs_dev.bin      # file chứa secret
idf.py -p COM3 monitor
```

(Trong CMD dùng `%IDF_PATH%` thay `$env:IDF_PATH`, `del nvs_dev.bin` thay `Remove-Item`.) Build báo
`certs/mqtt_ca.crt not found` nghĩa là chưa làm bước 3.

## 6. Kiểm tra từng chặng

| # | Kiểm | Dấu hiệu đạt |
|---|---|---|
| 1 | Gateway nối Broker 2 | Log gateway `gw_config: … mqtt=mqtts://<IP>:8883 … home_id=<h>` rồi `gw_mqtt: connected to broker`; header màn hình: Server xanh |
| 2 | Nhiệt/ẩm lên Server | Mỗi 10 s backend log `[mqttData] saved id=… from node-living-01 via gw-s3-demo-01` |
| 3 | Heartbeat | Sau ≤ 30 s, gateway/node/camera hiện **online** trên web (Thiết bị) |
| 4 | Ảnh camera | Vẫy tay trước PIR: gateway log `snapshot uploaded (… bytes) id=…` + `snapshot from cam-door-01 uploaded to server` |
| 5 | Thông báo chuyển động | Chuông thông báo của user01: "Phát hiện chuyển động" (chống lặp 60 s / camera) |
| 6 | Web khách | http://localhost:3003, đăng nhập `user01@smarthome.local` / `user123`, chọn nhà **Nhà demo phần cứng** → Tổng quan/Phòng khách: nhiệt độ, độ ẩm, công tắc Đèn/Quạt/Điều hòa và nút Mở/Đóng rèm; phòng **Camera** → **Camera** → khối "Ảnh camera" (tự làm mới 15 s) |
| 7 | Mobile | Chạy app với `--dart-define=API_BASE_URL=http://<IP>` (qua nginx :80) hoặc `http://<IP>:5000`; đăng nhập user01, chọn nhà, Phòng khách: điều khiển đèn/quạt/rèm/điều hòa; mở **Camera**: khung "Xem trực tiếp" (hiện báo chưa hỗ trợ trên ứng dụng — cắm nguồn luồng ở `cameraLiveSourceProvider` khi backend chuyển tiếp MJPEG) + ảnh mới tự hiện khi có tin WebSocket `camera_snapshot` |

Ảnh lưu trên đĩa ở `backend/storage/snapshots/` (dev, gitignore; prod: volume `snapshot_data`), giữ 7 ngày và tối đa 500 ảnh
mỗi camera (`CAMERA_SNAPSHOT_RETENTION_DAYS`). Đường dẫn file không bao giờ lộ ra client; ảnh chỉ tải được qua API có kiểm
quyền theo nhà (bất biến 6).

## 7. Xử lý sự cố

| Hiện tượng | Nguyên nhân thường gặp | Cách xử lý |
|---|---|---|
| Gateway `no route to server` / không `connected to broker` | Máy chủ khác mạng router; IP sai; firewall chặn 8883 | Mục 2; thử từ máy khác cùng mạng: `openssl s_client -connect <IP>:8883 -CAfile infra/mosquitto/certs/ca.crt` |
| Gateway lỗi TLS (`esp-tls … verify`, `MBEDTLS_ERR_X509_CERT_VERIFY_FAILED`) | Cert broker không có `<IP>` trong SAN, hoặc gateway nhúng CA cũ | Chạy lại bước 3 với đúng IP, `docker compose up -d --force-recreate mqtt-broker-2 nginx`; nếu đã thay CA thì build + nạp lại gateway |
| Gateway lỗi TLS ngay khi vừa khởi động | Chưa có giờ (RTC/NTP) nên cert bị coi là chưa hiệu lực | Chờ log NTP (có thể ~70 s sau khi nối router) |
| Backend `[mqttData] gateway auth fail (NOT_FOUND)` | Chưa chạy `hw:register`, hoặc chạy với `nvs_dev.csv` khác bản đã nạp | Bước 4 với đúng file |
| `gateway auth fail (TIMESTAMP_EXPIRED)` / audit `REPLAY_ATTACK` | Giờ gateway lệch > 300 s | Kiểm NTP của gateway và giờ máy chủ |
| `[mqttData] … is not a sensor` / camera 404 `CAMERA_NOT_FOUND` | Thiết bị tạo tay sai loại/không gán vào gateway | Chạy lại `hw:register` (sửa loại + gán gateway) |
| Thiết bị bị khoá (`DEVICE_BLOCKED`) sau nhiều lần sai | Secret trên backend khác NVS | Sửa NVS hoặc chạy lại `hw:register` (đặt lại secret + mở khoá) |
| Gateway `POST /api/device/camera/snapshot failed: HTTP 413` | Ảnh > 200 KB | Giảm độ phân giải/chất lượng ảnh chụp trên camera |
| `camera/event not sent: home_id unknown` | NVS thiếu `cloud/home_id` | Mục 5 |
| Ảnh bị từ chối HTTP 409 | Camera chưa gán vào nhà nào | Chạy lại `hw:register` |
| `hw:register` dừng vì thiết bị "đang thuộc nhà khác" | `device_id` trùng thiết bị ở nhà khác (VD đã đăng ký với email khác) | Kiểm lại `--owner`; chắc chắn muốn chuyển thì thêm `--force` |
| Web không thấy nhà mới | Đang chọn nhà khác | Chọn "Nhà demo phần cứng" ở bộ chọn nhà |
