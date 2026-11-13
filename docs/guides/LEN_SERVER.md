# LEN_SERVER.md — Đưa dữ liệu phần cứng thật lên Server và giao diện khách

Hướng dẫn nối bộ demo thật (Gateway Waveshare ESP32-S3 `gw-s3-demo-01`, Node phòng khách `node-living-01`, ESP32-CAM
`camera-01`) với backend, để **nhiệt độ/độ ẩm** và **ảnh camera khi có chuyển động** hiện trên cổng web khách
(`apps/user`, http://localhost:3003) và app Mobile.

Điều kiện trước: Node → Gateway và Camera → Gateway đã chạy (Gateway log `TELEMETRY node-living-01 verified`, nhận ảnh
`snapshot from camera-01`) — xem [NAP_CAMERA_GATEWAY](NAP_CAMERA_GATEWAY.md). Không cần nạp lại Node hay Camera.

## 1. Luồng dữ liệu

```
Node ──ESP-NOW──► Gateway ──MQTT TLS :8883  gateway/<gw>/data ─────────────► Broker MQTT ─► backend telemetry ─► sensor_data
                          ──MQTT TLS :8883  home/<h>/gateway/<gw>/heartbeat ─► Broker MQTT ─► backend devices (online)
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

Script dùng lại CA cũ (nếu có), cấp server cert có SAN = `<IP>` (dùng chung cho Broker MQTT :8883 và nginx :443), và **chép
CA vào** `firmware/ESP32-S3-Touch-LCD-4.3B-BOX-Demo/ESP-IDF/08_lvgl_Porting/certs/mqtt_ca.crt` (gitignore) để gateway nhúng
lúc build. Không bao giờ chép `ca.key` đi đâu.

## 4. Chạy Server và đăng ký thiết bị thật

```powershell
cd E:\WorkSpace\secure-smart-home-iot
docker compose up -d --build            # lần đầu; đã chạy rồi: docker compose up -d --force-recreate mqtt-broker nginx backend
docker compose logs -f backend          # chờ "[migrate]" xong và "[mqttData] connected"
```

Backend tự tạo bảng mới `camera_snapshots` khi khởi động (migration append-only).

Đăng ký thiết bị **với đúng device_id/secret đã nạp vào chip** (giá trị trong `nvs_dev.csv` của gateway — file gitignore).
Có 2 cách, cùng kết quả (nhà + phòng Phòng khách/Camera + gateway, node, camera, đèn/quạt/rèm/điều hoà — đều là thiết bị thật do node điều khiển):

**Cách 1 — trên console (Admin hoặc Operator), gắn được cho bất kỳ tài khoản khách nào.** Đăng nhập http://localhost:3001
(`admin`) hoặc http://localhost:3002 (`operator01`) → **Đăng ký Gateway** → chọn khách hàng (tài khoản khách tự tạo ở cổng
khách hàng `/register`, hoặc `user01@smarthome.local`) → đặt tên nhà → bấm **Điền từ file NVS (.csv)** chọn `nvs_dev.csv`
(đọc ngay trên trình duyệt, chỉ lấy `identity`/`nodes`) hoặc gõ tay Device ID + Secret → **Đăng ký**. Trang hiện `home_id`
cần ghi vào NVS ở bước 5. Gateway đang thuộc nhà khác: Admin được hỏi có chuyển không (thiết bị bị xoá khỏi nhà cũ cùng
số đo/ảnh cũ); Operator phải nhờ Admin.

**Cách 2 — công cụ dev trên máy** (không trong container, vì container không thấy thư mục firmware); `backend/.env` cần
`DB_HOST=localhost`, `DB_PORT=5433` như [CHAY_LOCAL](CHAY_LOCAL.md), script không in secret:

```powershell
cd backend
npm run hw:register
# tuỳ chọn: npm run hw:register -- --owner user01@smarthome.local --home-name "Nhà demo phần cứng" --nvs <đường dẫn csv>
```

Kết quả mẫu:

```
[hw:register] Đã tạo nhà "Nhà demo phần cứng" (home_id=5, chủ nhà user01@smarthome.local)
  - gw-s3-demo-01  id=31  gateway  phòng: (không)  "Gateway S3"
  - camera-01  id=32  camera  phòng: Camera  "Camera"
  - node-living-01  id=33  sensor  phòng: Phòng khách  "Cảm biến nhiệt/ẩm phòng khách"
  - node-living-01-lamp  id=34  relay (thật)  phòng: Phòng khách  "Đèn phòng khách"
  - node-living-01-fan  id=35  relay (thật)  phòng: Phòng khách  "Quạt phòng khách"
  - node-living-01-curtain  id=36  relay (thật)  phòng: Phòng khách  "Rèm cửa phòng khách"
  - node-living-01-ac  id=37  relay (thật)  phòng: Phòng khách  "Điều hòa phòng khách"
[hw:register] Nhớ ghi cloud/home_id = 5 vào NVS gateway để gửi heartbeat/sự kiện camera.
```

Seed demo không tạo nhà hay thiết bị nào (từ 2026-11-13 seed chỉ tạo tài khoản; dữ liệu mô phỏng của seed cũ được backend tự dọn một lần), nên đây là nhà duy nhất trên hệ thống cho tới khi đăng ký thêm.

Chạy lại bất cứ lúc nào (idempotent): nhà/phòng dùng lại, thiết bị cập nhật secret theo NVS và được mở khoá (`fail_count = 0`).
Nhà đã đăng ký bằng bản cũ (phòng "Cửa chính" chứa "Camera cửa chính") được đổi thành phòng **Camera** / thiết bị **Camera**
(tên khách đã tự đổi thì giữ nguyên).

Đèn, quạt (relay), rèm (động cơ bước) và điều hoà (IR) của phòng khách đều là thiết bị **thật** (`is_simulated = FALSE`,
từ 2026-11-13): lệnh trên web/mobile đi MQTT → gateway → node (ESP-NOW), trạng thái và online lấy từ telemetry của node.
Rèm dùng `turn_on` = mở hẳn, `turn_off` = đóng hẳn. Nhà đăng ký trước ngày đó (đèn/quạt/rèm còn mô phỏng) được backend tự
chuyển sang thật khi khởi động (migration `set_node_appliances_real_2026_11`); chạy lại script cũng cho cùng kết quả.
**Thứ tự triển khai:** nạp firmware Node mới (có relay/rèm, [README của Node](../../firmware/esp32_s3_firmware_node/README.md))
**trước** khi khởi động backend bản này — Node cũ không nhận lệnh đèn/quạt/rèm nên web sẽ báo lỗi 502/504 thay vì bật được như
lúc còn mô phỏng.
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

## 5b. Đổi mã camera `cam-door-01` → `camera-01` (2026-11-14)

Mã camera là `device_id` dùng để ký HMAC, nên phải khớp ở **cả 3 nơi**: NVS của Camera, NVS của Gateway (`nodes/0_id`) và
bảng `devices` của backend. Hai file `nvs_dev.csv` trên máy dev đã được sửa sẵn (`identity/device_uuid` của Camera và
`nodes/0_id` của Gateway; secret, LMK giữ nguyên). Làm đủ 3 bước, theo thứ tự — làm dở thì Camera bị từ chối (Gateway log
`bad signature` / backend `sensor not found`):

1. Đổi mã trong database (ảnh chụp cũ giữ nguyên vì gắn theo id nội bộ, không theo mã):

   ```powershell
   docker exec -it iot-postgres psql -U <POSTGRES_APP_USER> -d secure_smart_home_iot -c "UPDATE devices SET device_id = 'camera-01' WHERE device_id = 'cam-door-01';"
   ```

   `<POSTGRES_APP_USER>` lấy trong `.env` như [CHAY_LOCAL](CHAY_LOCAL.md). Kết quả phải là `UPDATE 1`.

2. Nạp lại NVS cho **Camera** (COM6), trong thư mục `firmware\esp32_cam` — như [NAP_CAMERA_GATEWAY](NAP_CAMERA_GATEWAY.md) mục Camera:

   ```powershell
   python $env:IDF_PATH\components\nvs_flash\nvs_partition_generator\nvs_partition_gen.py generate nvs_dev.csv nvs_dev.bin 0x4000
   python $env:IDF_PATH\components\partition_table\parttool.py -p COM6 write_partition --partition-name=nvs --input nvs_dev.bin
   Remove-Item nvs_dev.bin      # file chứa secret
   ```

3. Nạp lại NVS cho **Gateway** (COM3) như mục 5 (`nvs_partition_gen` 0x6000 + `parttool write_partition`). Ghi đè cả phân
   vùng nên mất "lần cuối kết nối" đã lưu của các thiết bị — không ảnh hưởng gì khác.

Xong: tab **Thiết bị** trên màn hình Gateway hiện `node-living-01` và `camera-01`; Gateway log `snapshot from camera-01`.

## 6. Kiểm tra từng chặng

| # | Kiểm | Dấu hiệu đạt |
|---|---|---|
| 1 | Gateway nối Broker MQTT | Log gateway `gw_config: … mqtt=mqtts://<IP>:8883 … home_id=<h>` rồi `gw_mqtt: connected to broker`; header màn hình: Server xanh |
| 2 | Nhiệt/ẩm lên Server | Mỗi 10 s backend log `[mqttData] saved id=… from node-living-01 via gw-s3-demo-01` |
| 3 | Heartbeat | Sau ≤ 30 s, gateway/node/camera hiện **online** trên web (Thiết bị) |
| 4 | Ảnh camera | Vẫy tay trước PIR: gateway log `snapshot uploaded (… bytes) id=…` + `snapshot from camera-01 uploaded to server` |
| 5 | Thông báo chuyển động | Chuông thông báo của user01: "Phát hiện chuyển động" (chống lặp 60 s / camera) |
| 6 | Web khách | http://localhost:3003, đăng nhập `user01@smarthome.local` / `user123`, nhà **Nhà demo phần cứng** → Tổng quan/Phòng khách: nhiệt độ, độ ẩm, công tắc Đèn/Quạt/Điều hòa và nút Mở/Đóng rèm; phòng **Camera** → **Camera** → khối "Ảnh camera" (tự làm mới 15 s) |
| 7 | Mobile | Chạy app với `--dart-define=API_BASE_URL=http://<IP>` (qua nginx :80) hoặc `http://<IP>:5000`; đăng nhập user01, chọn nhà, Phòng khách: điều khiển đèn/quạt/rèm/điều hòa; mở **Camera**: khung "Xem trực tiếp" (hiện báo chưa hỗ trợ trên ứng dụng — cắm nguồn luồng ở `cameraLiveSourceProvider` khi backend chuyển tiếp MJPEG) + ảnh mới tự hiện khi có tin WebSocket `camera_snapshot` |

Ảnh lưu trên đĩa ở `backend/storage/snapshots/` (dev, gitignore; prod: volume `snapshot_data`), giữ 7 ngày và tối đa 500 ảnh
mỗi camera (`CAMERA_SNAPSHOT_RETENTION_DAYS`). Đường dẫn file không bao giờ lộ ra client; ảnh chỉ tải được qua API có kiểm
quyền theo nhà (bất biến 6).

### Xem trực tiếp camera trên web

Hiện trạng (2026-11-13): backend + web user + firmware đã viết, **chưa thử đầu-cuối** với phần cứng. Luồng và hợp đồng: [API](../API_DESIGN.md) §5.1, §8, §9.1; thiết kế: [IoT Node Network](../firmware/IOT_NODE_NETWORK.md) §5.5.

**Điều kiện:**
- Gateway nối Server qua **HTTPS cổng 443** (nginx, cùng cert với ảnh camera — mục 3, 5): Gateway mở WebSocket `wss://<IP>/api/device/camera/live` qua đó. Chỉ có đường `http://…:5000` thì Gateway dùng `ws://` (chỉ để dev).
- Camera đã **gán vào nhà** (`hw:register`, mục 4) và không phải camera mô phỏng; tài khoản là OWNER/CONTROLLER/VIEWER của nhà (GUEST và Admin/Operator không xem được).
- Mở web khách → nhà → phòng **Camera** → **Camera** → khối xem trực tiếp (bấm nút bắt đầu xem). Backend gửi lệnh MQTT `live_start`, Gateway kéo luồng từ camera rồi đẩy khung lên; trên LCD Gateway hiện nhãn **"Đang được xem từ xa"**.

**Dev (web chạy `npm run dev` ở :3003):** Next rewrites có thể không chuyển tiếp WebSocket, nên cho web nối thẳng backend:
- Đặt `NEXT_PUBLIC_LIVE_WS_ORIGIN=ws://localhost:5000` cho app user rồi khởi động lại dev server (biến `NEXT_PUBLIC_*` nạp lúc khởi động).
- `compose.yaml` (dev) đã cho sẵn `FRONTEND_URL=http://localhost,http://localhost:3001,http://localhost:3002,http://localhost:3003` — Next dev ở :3003 tự chuyển tiếp WebSocket `/api/*` sang backend (đổi Host thành `backend:5000`), nên không cần `NEXT_PUBLIC_LIVE_WS_ORIGIN` khi chạy bằng Docker. Chạy backend ngoài Docker thì thêm origin của web vào `FRONTEND_URL` của backend (danh sách phân tách dấu phẩy), VD `FRONTEND_URL=http://localhost,http://localhost:3003`, rồi khởi động lại backend — backend kiểm `Origin` chống CSWSH và từ chối origin không có trong danh sách (403 trước upgrade, trình duyệt chỉ thấy lỗi kết nối chung). Qua nginx (cùng origin) thì không cần cả hai.

**Sự cố theo thông báo / mã đóng** (web hiện câu tiếng Việt tương ứng):

| Mã đóng | Thông báo trên web | Nguyên nhân + cách xử lý |
|---|---|---|
| `4401` | Phiên đăng nhập đã hết hạn | Đăng nhập lại |
| `4403` | Không có quyền xem trực tiếp | Role trong nhà là GUEST — đổi role hoặc dùng tài khoản OWNER/CONTROLLER/VIEWER |
| `4404` | Không tìm thấy camera | Camera không thuộc nhà của tài khoản, hoặc không phải camera |
| `4408` | Camera không phản hồi | Sau 20 s không có luồng từ Gateway: kiểm Gateway online (heartbeat), Gateway nối được HTTPS 443, camera còn nguồn và trong Local AP; xem log Gateway (`gw_camera_relay`, `gw_camera_live`) |
| `4409` | Quá nhiều người xem | Camera đã đủ 4 người xem — đóng bớt |
| `4429` | Mở quá nhiều luồng | Tối đa 2 luồng/user và 10 lần mở/phút — đóng tab khác, chờ 1 phút |
| `4501` | Camera mô phỏng không hỗ trợ | Chỉ camera thật xem được |
| 1006 (không có mã) | "Không kết nối được máy chủ…" | Lỗi trước upgrade (Origin không nằm trong `FRONTEND_URL`, cookie hết hạn, quá 60 upgrade/phút/IP) hoặc proxy không chuyển WebSocket; kiểm `FRONTEND_URL`, đăng nhập lại, nginx có `Upgrade` cho `/api/` |
| Gateway log `409` / `429` khi mở uplink | Uplink cũ của phiên chưa im đủ 3 s / quá 30 upgrade/phút/IP | Gateway tự thử lại 1, 2, 4 s; không cần xử lý |

**Dòng log để đo fps** (mỗi ~5 giây; chỉ ghi số đo thật vào tài liệu sau khi đo trên board):

| Nơi | Dòng log | Ý nghĩa |
|---|---|---|
| Camera | `cam_stream: sent X.Y fps, avg frame N B` | Khung/giây camera gửi cho Gateway, cỡ khung trung bình |
| Gateway | `gw_camera_live: rx X.Y fps, N KB/s (… frames in … ms)` | Khung/giây nhận từ camera |
| Gateway | `gw_live_view: shown X.Y fps, decode avg N ms (max …), submitted …, dropped … (replaced), failed …` | fps hiển thị trên LCD, thời gian giải nén trung bình, khung bị ghi đè |
| Gateway | `gw_camera_relay: relay sent X.Y fps, N KB/s, offered …, dropped …` | fps gửi lên Server khi có người xem từ xa (trần `CONFIG_GW_CAMERA_RELAY_MAX_FPS`, mặc định 15) |
| Web | fps hiện trên player | fps khung nhận ở trình duyệt |

**Sau khi cập nhật code firmware, xoá `sdkconfig` của camera và của gateway** rồi `idf.py set-target …` lại để nhận giá trị mới từ `sdkconfig.defaults` (VD chất lượng JPEG, độ phân giải luồng, trần fps relay) — `sdkconfig` cũ giữ giá trị cũ. Chi tiết lệnh: [Nạp camera + gateway](NAP_CAMERA_GATEWAY.md).

## 7. Xử lý sự cố

| Hiện tượng | Nguyên nhân thường gặp | Cách xử lý |
|---|---|---|
| Gateway `no route to server` / không `connected to broker` | Máy chủ khác mạng router; IP sai; firewall chặn 8883 | Mục 2; thử từ máy khác cùng mạng: `openssl s_client -connect <IP>:8883 -CAfile infra/mosquitto/certs/ca.crt` |
| Gateway lỗi TLS (`esp-tls … verify`, `MBEDTLS_ERR_X509_CERT_VERIFY_FAILED`) | Cert broker không có `<IP>` trong SAN, hoặc gateway nhúng CA cũ | Chạy lại bước 3 với đúng IP, `docker compose up -d --force-recreate mqtt-broker nginx`; nếu đã thay CA thì build + nạp lại gateway |
| Gateway lỗi TLS ngay khi vừa khởi động | Chưa có giờ (RTC/NTP) nên cert bị coi là chưa hiệu lực | Chờ log NTP (có thể ~70 s sau khi nối router) |
| Backend `[mqttData] gateway auth fail (NOT_FOUND)` | Chưa chạy `hw:register`, hoặc chạy với `nvs_dev.csv` khác bản đã nạp | Bước 4 với đúng file |
| `gateway auth fail (TIMESTAMP_EXPIRED)` / audit `REPLAY_ATTACK` | Giờ gateway lệch > 300 s | Kiểm NTP của gateway và giờ máy chủ |
| `[mqttData] … is not a sensor` / camera 404 `CAMERA_NOT_FOUND` | Thiết bị tạo tay sai loại/không gán vào gateway | Chạy lại `hw:register` (sửa loại + gán gateway) |
| Thiết bị bị khoá (`DEVICE_BLOCKED`) sau nhiều lần sai | Secret trên backend khác NVS | Sửa NVS hoặc chạy lại `hw:register` (đặt lại secret + mở khoá) |
| Gateway `POST /api/device/camera/snapshot failed: HTTP 413` | Ảnh > 200 KB | Giảm độ phân giải/chất lượng ảnh chụp trên camera |
| `camera/event not sent: home_id unknown` | NVS thiếu `cloud/home_id` | Mục 5 |
| Ảnh bị từ chối HTTP 409 | Camera chưa gán vào nhà nào | Chạy lại `hw:register` |
| `hw:register` dừng vì thiết bị "đang thuộc nhà khác" | `device_id` trùng thiết bị ở nhà khác (VD đã đăng ký với email khác) | Kiểm lại `--owner`; chắc chắn muốn chuyển thì thêm `--force` |
| Web khách không có nhà nào | Chưa đăng ký gateway (trang Đăng ký Gateway hoặc `npm run hw:register`) sau khi tạo lại DB | Bước 4, rồi ghi `home_id` mới vào NVS (bước 5) |
