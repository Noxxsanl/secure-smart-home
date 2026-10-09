# Hướng Dẫn Chạy Local (Không Dùng Docker)

> Chạy toàn bộ hệ thống trực tiếp trên máy Windows, không cần Docker Desktop.
> Mỗi service chạy trong **một terminal riêng**.

---

## Tổng quan — 5 service cần chạy

```
Terminal 1: MySQL 8.0             (database, port 3306)
Terminal 2: Mosquitto Broker 1    (Sensor ↔ Gateway, port 1883)
Terminal 3: Mosquitto Broker 2    (Gateway → Backend, TLS port 8883)
Terminal 4: Backend Express       (API,      port 5000)
Terminal 5: Frontend Next.js      (3 app web: Admin 3001, Operator 3002, Khách hàng 3003)
(tuỳ chọn) Mobile Flutter         (app khách hàng, xem Bước 7)
```

---

## Bước 1 — Cài phần mềm cần thiết

### 1.1 Node.js (>= 20)

Tải tại: https://nodejs.org → chọn **LTS** → cài mặc định

Kiểm tra sau khi cài:
```powershell
node --version   # v20.x.x trở lên
npm --version    # 10.x.x trở lên
```

### 1.2 MySQL 8.0

Tải tại: https://dev.mysql.com/downloads/installer/

Chọn **MySQL Installer (Windows)** → chạy cài đặt:
- Chọn loại: **Developer Default** hoặc **Server only**
- Trong bước cấu hình, đặt **root password** (nhớ lại để dùng ở Bước 2)
- Port giữ nguyên: **3306**
- Cài xong, MySQL tự chạy như Windows Service

Kiểm tra:
```powershell
mysql --version
# mysql  Ver 8.0.x ...
```

Nếu lệnh `mysql` không nhận dạng, thêm vào PATH:
```powershell
# Thêm vào PATH (thay X.X bằng version thực tế)
$env:PATH += ";C:\Program Files\MySQL\MySQL Server 8.0\bin"
```

### 1.3 Mosquitto MQTT Broker

Tải tại: https://mosquitto.org/download/ → chọn **Windows** → file `.exe`

Cài mặc định vào: `C:\Program Files\mosquitto\`

Kiểm tra:
```powershell
& "C:\Program Files\mosquitto\mosquitto.exe" --help
```

---

## Bước 2 — Tạo Database MySQL

Mở **PowerShell** (hoặc Command Prompt), kết nối MySQL bằng tài khoản root:

```powershell
mysql -u root -p
# Nhập root password đã đặt lúc cài
```

Sau khi vào MySQL shell (`mysql>`), chạy lần lượt:

```sql
-- Tạo database
CREATE DATABASE IF NOT EXISTS iot_managerDeviceIoT
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

-- Tạo user riêng cho ứng dụng
CREATE USER IF NOT EXISTS 'iot_managerIoT'@'localhost'
  IDENTIFIED BY 'iot_managerIoTpassword';

-- Cấp quyền
GRANT ALL PRIVILEGES ON iot_managerDeviceIoT.*
  TO 'iot_managerIoT'@'localhost';

FLUSH PRIVILEGES;

-- Kiểm tra
SHOW DATABASES;
-- phải thấy: iot_managerDeviceIoT

EXIT;
```

### Import schema và tạo bảng

```powershell
# Chạy file SQL migration (từ thư mục gốc dự án)
cd e:\WorkSpace\managerDeviceIoT

mysql -u iot_managerIoT -piot_managerIoTpassword iot_managerDeviceIoT `
      < database\migrations\001_schema.sql
```

Kiểm tra bảng đã tạo:
```powershell
mysql -u iot_managerIoT -piot_managerIoTpassword iot_managerDeviceIoT `
      -e "SHOW TABLES;"
```

Kết quả mong đợi (V2 có thêm nhiều bảng: `customers`, `smart_homes`, `rooms`, `smart_home_members`, `activation_tokens`, `refresh_tokens`, `device_commands`, `automation_rules`, `firmware`, `ota_jobs`, …):
```
audit_log, device_tokens, devices, sensor_data, users, notifications, + các bảng V2
```

> File SQL đã bao gồm sẵn lệnh tạo user `admin` với password `admin123`. Bước seed ở dưới chỉ cần chạy **nếu** bảng `users` trống.
> Backend cũng tự áp migration (`backend/src/config/migrate.ts`) mỗi lần khởi động, nên DB cũ được nâng lên schema V2 mà không cần import lại.

---

## Bước 3 — Cấu hình và chạy Mosquitto (2 Broker)

### Tạo file config cho Broker 1 (Sensor ↔ Gateway, port 1883)

Tạo file `mosquitto\broker1_local.conf`:

```powershell
# Tạo thư mục data nếu chưa có
New-Item -ItemType Directory -Force -Path "e:\WorkSpace\managerDeviceIoT-RBAC\mosquitto\data"

# Tạo file config Broker 1
@'
listener 1883
allow_anonymous true
log_type all
log_dest stdout
persistence true
persistence_location e:\WorkSpace\managerDeviceIoT-RBAC\mosquitto\data\broker1\
'@ | Out-File -Encoding utf8 "e:\WorkSpace\managerDeviceIoT-RBAC\mosquitto\broker1_local.conf"
```

### Sinh chứng chỉ TLS cho Broker 2

Broker 2 chỉ nhận MQTT over TLS (FR-12.3). Mở **Git Bash** ở thư mục gốc repo, truyền IP LAN của máy này (IP mà gateway dùng làm `MQTT_BROKER2_HOST`):

```bash
bash scripts/gen_mqtt_certs.sh 192.168.1.100
```

Script tạo `mosquitto\certs\` (CA + cert broker) và `firmware\gateway-node\include\mqtt_ca_cert.h`. Chỉ cần chạy lại khi đổi IP LAN — CA giữ nguyên nên không phải nạp lại firmware. Chi tiết: [`14_MQTT_TLS.md`](14_MQTT_TLS.md).

### Tạo file config cho Broker 2 (Gateway → Backend, TLS port 8883)

Tạo file `mosquitto\broker2_local.conf`:

```powershell
# Tạo file config Broker 2 — chỉ listener TLS, không còn cổng plaintext
@'
listener 8883
cafile   e:\WorkSpace\managerDeviceIoT-RBAC\mosquitto\certs\ca.crt
certfile e:\WorkSpace\managerDeviceIoT-RBAC\mosquitto\certs\server.crt
keyfile  e:\WorkSpace\managerDeviceIoT-RBAC\mosquitto\certs\server.key
tls_version tlsv1.2
allow_anonymous true
log_type all
log_dest stdout
persistence true
persistence_location e:\WorkSpace\managerDeviceIoT-RBAC\mosquitto\data\broker2\
'@ | Out-File -Encoding utf8 "e:\WorkSpace\managerDeviceIoT-RBAC\mosquitto\broker2_local.conf"
```

### Mở Terminal 2 — chạy Broker 1 (port 1883)

```powershell
& "C:\Program Files\mosquitto\mosquitto.exe" `
    -c "e:\WorkSpace\managerDeviceIoT-RBAC\mosquitto\broker1_local.conf" `
    -v
```

Output mong đợi:
```
1749383000: mosquitto version 2.x.x starting
1749383000: Opening ipv4 listen socket on port 1883.
1749383000: mosquitto version 2.x.x running
```

### Mở Terminal 3 — chạy Broker 2 (TLS port 8883)

```powershell
& "C:\Program Files\mosquitto\mosquitto.exe" `
    -c "e:\WorkSpace\managerDeviceIoT-RBAC\mosquitto\broker2_local.conf" `
    -v
```

Output mong đợi:
```
1749383000: mosquitto version 2.x.x starting
1749383000: Opening ipv4 listen socket on port 8883.
1749383000: mosquitto version 2.x.x running
```

> Để **cả hai terminal** này **mở suốt** trong quá trình dùng hệ thống. Đừng đóng.

---

## Bước 4 — Cấu hình và chạy Backend

### Mở Terminal 4 — dành riêng cho Backend

```powershell
cd e:\WorkSpace\managerDeviceIoT-RBAC\backend
```

### Tạo file `.env`

Kiểm tra file đã tồn tại chưa:
```powershell
Test-Path .env
```

Nếu chưa có (kết quả `False`), tạo mới:
```powershell
@'
PORT=5000

# Database
DB_HOST=localhost
DB_PORT=3306
DB_USER=iot_managerIoT
DB_PASS=iot_managerIoTpassword
DB_NAME=iot_managerDeviceIoT

# JWT (phải >= 32 ký tự)
JWT_SECRET=local_dev_secret_key_change_in_production_32chars

# MQTT Broker 2 (Gateway → Backend layer) — MQTT over TLS
MQTT_HOST=localhost
MQTT_PORT=8883
MQTT_CA_FILE=../mosquitto/certs/ca.crt

# CORS (3 app web gọi cùng origin qua rewrites nên chủ yếu dùng khi gọi thẳng backend)
FRONTEND_URL=http://localhost:3001

# Admin default (dùng cho seed)
ADMIN_USERNAME=admin
ADMIN_PASSWORD=admin123
'@ | Out-File -Encoding utf8 .env
```

### Biến môi trường V2 (tuỳ chọn)

Tất cả có mặc định an toàn (mẫu đầy đủ: `backend/.env.example`). Chỉ thêm vào `.env` khi cần đổi:

| Biến | Mặc định | Ý nghĩa |
|---|---|---|
| `MOBILE_JWT_SECRET` | dẫn xuất từ `JWT_SECRET` | Secret ký access token Mobile (≥ 32 ký tự) |
| `ACTIVATION_QR_SECRET` | dẫn xuất từ `JWT_SECRET` | Secret ký payload QR kích hoạt (≥ 32 ký tự) |
| `COOKIE_SECURE` | `true` khi `NODE_ENV=production` | Cờ `Secure` cho cookie phiên. Chạy HTTP local để trống/`false` |
| `DEVICE_SIMULATOR` | `true` khi `NODE_ENV` khác `production` | Bật simulator thiết bị ảo (`is_simulated=1`) |
| `SEED_DEMO_DATA` | `true` khi `NODE_ENV` khác `production` | Seed dữ liệu demo một lần sau migration |
| `ACTIVATION_CODE_TTL_DAYS` | `180` | Hạn Activation Code (ngày) |
| `FIRMWARE_STORAGE_DIR` | `storage/firmware` | Thư mục lưu file firmware upload |
| `TELEMETRY_RETENTION_DAYS` | `8` | Số ngày giữ `sensor_data` (job dọn mỗi giờ) |
| `TRUST_PROXY` | `false` | Số hop proxy tin cậy. Đặt `1` khi backend chạy sau nginx để lấy đúng IP client (rate-limit, audit) |

> Không commit `.env`. Production: tắt `DEVICE_SIMULATOR` và `SEED_DEMO_DATA`.

> **Quan trọng:** Khi chạy local, `DB_HOST=localhost` và `MQTT_HOST=localhost` với `MQTT_PORT=8883` (Broker 2, TLS). `MQTT_HOST` phải nằm trong SAN của cert broker (`localhost` luôn có sẵn).
> Khác với Docker: `MQTT_HOST=mqtt-broker-2`, `MQTT_PORT=8883`, `MQTT_CA_FILE=/certs/mqtt-ca.crt` (compose tự đặt).
> Thiếu file CA thì backend dừng ngay khi khởi động với lỗi `[startup] Cannot read MQTT CA certificate ...`.

### Cài dependencies

```powershell
npm install
```

Lần đầu sẽ tải khoảng 1–2 phút.

### (Tùy chọn) Seed admin user

Chỉ cần chạy nếu bảng `users` trống (file SQL migration đã tạo sẵn admin):
```powershell
npm run seed
# [seed] Admin user 'admin' already exists, skipped.
```

### Chạy Backend

```powershell
npm run dev
```

Output mong đợi:
```
[ts-node-dev] Starting...
[DB] Connected to MySQL at localhost:3306
[mqttTracker] connected, subscribing to $SYS logs
[mqttData] connected, subscribing to gateway/+/data
[Server] Listening on port 5000
```

> **Lần chạy đầu — đọc log backend:** migration V2 và seed chạy ngay lúc khởi động. Tìm dòng `[migrate] FAILED <tên>: …` — nếu có, migration dừng, server vẫn chạy nhưng **seed bị bỏ qua** (sửa lỗi DB rồi khởi động lại). Seed thành công in các dòng `[seed] created …` (không in secret). Seed chạy một lần (đánh dấu `seed_demo_v2` trong `_migrations`) và idempotent.

Kiểm tra nhanh backend đang chạy:
```powershell
# Mở tab PowerShell khác
curl http://localhost:5000/api/health
# {"status":"ok","db":"connected","mqtt":"connected"}
```

> Để terminal này **mở suốt**. `ts-node-dev` tự restart khi bạn sửa code backend.

---

## Bước 5 — Cấu hình và chạy Frontend (3 app web)

### Mở Terminal 5 — dành riêng cho Frontend

```powershell
cd e:\WorkSpace\managerDeviceIoT-RBAC\frontend
```

### Tạo file `.env.local`

Kiểm tra:
```powershell
Test-Path .env.local
```

Nếu chưa có, tạo mới:
```powershell
@'
BACKEND_URL=http://localhost:5000
'@ | Out-File -Encoding utf8 .env.local
```

> `BACKEND_URL` (chỉ gốc URL, không kèm `/api`; mặc định `http://localhost:5000`) được `next.config.ts` của mỗi app dùng cho `rewrites` `/api/:path*` → `${BACKEND_URL}/api/:path*`. Trình duyệt chỉ gọi `/api/*` cùng origin nên cookie đi kèm tự động, không cần CORS. Không còn route `/api/[...path]`. Cũng có thể đặt trực tiếp: `$env:BACKEND_URL="http://192.168.1.10:5000"; npm run dev`. Chi tiết: [`frontend/README.md`](../frontend/README.md).

### Cài dependencies

```powershell
npm install
```

Lần đầu khoảng 2–3 phút (npm workspaces, cài chung cho cả 3 app).

### Chạy Frontend

```powershell
npm run dev
```

Lệnh này khởi động cả 3 app cùng lúc (mỗi role một app, một cổng):

| App | Cổng | Role |
|---|---|---|
| `admin` | 3001 | ADMIN |
| `operator` | 3002 | OPERATOR |
| `user` | 3003 | USER (cổng web khách hàng) |

Output mong đợi (mỗi app một dòng tương tự):
```
  ▲ Next.js 16.2.5
  - Local:        http://localhost:3001
 ✓ Ready in 2.1s
```

> Để terminal này **mở suốt**.

---

## Bước 6 — Kiểm tra toàn bộ hệ thống

### Kiểm tra từng service

```powershell
# Terminal mới — kiểm tra nhanh
Write-Host "=== Kiểm tra services ===" -ForegroundColor Cyan

# MySQL
try {
    $r = mysql -u iot_managerIoT -piot_managerIoTpassword `
               iot_managerDeviceIoT -e "SELECT 1;" 2>&1
    Write-Host "[MySQL]     OK" -ForegroundColor Green
} catch {
    Write-Host "[MySQL]     FAIL" -ForegroundColor Red
}

# Backend
try {
    $r = Invoke-RestMethod -Uri "http://localhost:5000/api/health" -Method Get
    Write-Host "[Backend]   OK — db:$($r.db) mqtt:$($r.mqtt)" -ForegroundColor Green
} catch {
    Write-Host "[Backend]   FAIL — chưa chạy hoặc lỗi kết nối DB/MQTT" -ForegroundColor Red
}

# Frontend (3 app)
foreach ($p in 3001,3002,3003) {
    try {
        $r = Invoke-WebRequest -Uri "http://localhost:$p" -UseBasicParsing -TimeoutSec 5
        Write-Host "[Frontend :$p]  OK — HTTP $($r.StatusCode)" -ForegroundColor Green
    } catch {
        Write-Host "[Frontend :$p]  FAIL" -ForegroundColor Red
    }
}

# Mosquitto Broker 1 (Sensor ↔ Gateway)
$mqtt1 = Get-NetTCPConnection -LocalPort 1883 -ErrorAction SilentlyContinue
if ($mqtt1) {
    Write-Host "[Broker 1]  OK — port 1883 đang mở" -ForegroundColor Green
} else {
    Write-Host "[Broker 1]  FAIL — port 1883 chưa mở" -ForegroundColor Red
}

# Mosquitto Broker 2 (Gateway → Backend)
$mqtt2 = Get-NetTCPConnection -LocalPort 8883 -ErrorAction SilentlyContinue
if ($mqtt2) {
    Write-Host "[Broker 2]  OK — port 8883 (TLS) đang mở" -ForegroundColor Green
} else {
    Write-Host "[Broker 2]  FAIL — port 8883 (TLS) chưa mở" -ForegroundColor Red
}
```

### Truy cập ứng dụng

Mở trình duyệt:

| Service | URL |
|---|---|
| **Admin console** | http://localhost:3001 |
| **Operator console** | http://localhost:3002 |
| **Cổng khách hàng** | http://localhost:3003 |
| **Backend Health** | http://localhost:5000/api/health |

Mỗi app chỉ nhận đúng role của nó; đăng nhập nhầm cổng sẽ được hướng dẫn sang cổng đúng. Cookie phiên tách theo cổng (`sh_admin` / `sh_operator` / `sh_user`) nên đăng nhập 3 app cùng lúc không ghi đè nhau.

### Dữ liệu demo (seed)

Khi `SEED_DEMO_DATA` bật (mặc định ở môi trường không phải production), backend seed dữ liệu demo — mọi thiết bị trong nhà demo là thiết bị mô phỏng (`is_simulated=1`).

| Vai trò | Đăng nhập | Mật khẩu | Cổng |
|---|---|---|---|
| Admin | `admin` | `admin123` | 3001 |
| Operator | `operator01` (và `operator02`) | `operator123` | 3002 |
| Khách hàng | `user01@smarthome.local` (chủ "Nhà của Đạt") | `user123` | 3003 / Mobile |
| Khách hàng | `lan@…`, `hoa@…`, `hung@…`, `kimanh@…` (`@smarthome.local`; `kimanh` chưa có nhà) | `user123` | 3003 / Mobile |

Activation Code để thử luồng claim (Thêm Smart Home / quét QR):

| Code | Trạng thái |
|---|---|
| `7K2M-9QXA-4TPB` | Hợp lệ |
| `H3VD-8NRW-2CYE` | Hợp lệ |
| `Q4ZT-6MJK-1PSX` | Đã dùng |
| `B9FE-3WRA-7GMK` | Hết hạn |

> Mật khẩu/mã trên chỉ là dữ liệu demo local — không dùng ở production.

---

## Tóm tắt thứ tự khởi động

```
Mỗi lần mở máy muốn chạy hệ thống, làm theo thứ tự này:

[Terminal 2] Mosquitto Broker 1 (Sensor ↔ Gateway, port 1883)
  & "C:\Program Files\mosquitto\mosquitto.exe" -c "e:\WorkSpace\managerDeviceIoT-RBAC\mosquitto\broker1_local.conf" -v

[Terminal 3] Mosquitto Broker 2 (Gateway → Backend, TLS port 8883)
  & "C:\Program Files\mosquitto\mosquitto.exe" -c "e:\WorkSpace\managerDeviceIoT-RBAC\mosquitto\broker2_local.conf" -v

[Terminal 4] Backend
  cd e:\WorkSpace\managerDeviceIoT-RBAC\backend
  npm run dev

[Terminal 5] Frontend (3 app: 3001 / 3002 / 3003)
  cd e:\WorkSpace\managerDeviceIoT-RBAC\frontend
  npm run dev

→ Mở http://localhost:3001 (Admin), :3002 (Operator), :3003 (Khách hàng)
```

> MySQL tự chạy như Windows Service khi khởi động máy — không cần mở thêm terminal.

---

## Bước 6b — Simulator thiết bị (không cần phần cứng)

Với `DEVICE_SIMULATOR` bật, backend tự mô phỏng các thiết bị `is_simulated=1`: giữ `last_seen` mới (online trong cửa sổ 90 s), sinh số liệu nhiệt/ẩm mỗi 60 s, ack lệnh bật/tắt relay sau 300–900 ms. Nhà tạo mới qua Provisioning Wizard cũng toàn thiết bị mô phỏng. Thiết bị thật cũ trong DB không bị đụng tới (hiện "Chưa gán nhà").

Giả lập sự cố từ console (đăng nhập Admin/Operator), trong chi tiết thiết bị mô phỏng:
- **Mất điện:** tắt "nguồn" thiết bị (`POST /api/dashboard/simulator/devices/:id/power` `{ "online": false }`) — thiết bị chuyển offline sau khoảng 90 s, khách hàng nhận thông báo "offline". Bật lại để online.
- **Mở cửa:** với cảm biến cửa mô phỏng, bật trạng thái mở (`POST …/simulator/devices/:id/door` `{ "open": true }`) — khách hàng nhận thông báo cửa mở.

Chỉ áp dụng cho thiết bị mô phỏng (thiết bị thật → `409 NOT_SIMULATED`).

---

## Bước 7 — Chạy Mobile (Flutter, tuỳ chọn)

```powershell
cd e:\WorkSpace\managerDeviceIoT-RBAC\mobile
flutter pub get

# Gọi backend thật — thay <LAN-IP> bằng IP máy chạy backend
flutter run --dart-define=API_BASE_URL=http://<LAN-IP>:5000

# Hoặc chạy hoàn toàn bằng dữ liệu giả, không cần backend
flutter run --dart-define=USE_MOCK=true
```

- Android emulator: mặc định `API_BASE_URL=http://10.0.2.2:5000` (alias tới localhost của máy host), không cần truyền.
- Thiết bị thật: điện thoại và máy chạy backend cùng mạng LAN; dùng IP LAN của máy, không dùng `localhost`.
- Đăng nhập bằng tài khoản khách hàng ở bảng seed (ví dụ `user01@smarthome.local` / `user123`). Realtime qua WebSocket `/api/mobile/ws`.
- Kiểm tra: `flutter analyze && flutter test`.

---

## Xử lý lỗi thường gặp

### Lỗi: `ECONNREFUSED 127.0.0.1:3306`

Backend không kết nối được MySQL.

```powershell
# Kiểm tra MySQL đang chạy chưa
Get-Service -Name "MySQL*"
# Status phải là "Running"

# Nếu Stopped, khởi động lại
Start-Service -Name "MySQL80"   # tên service có thể khác, kiểm tra ở trên
```

### Lỗi: `ER_ACCESS_DENIED_ERROR`

Sai username hoặc password trong `.env`.

```powershell
# Kiểm tra kết nối thủ công
mysql -u iot_managerIoT -piot_managerIoTpassword iot_managerDeviceIoT -e "SELECT 1;"
```

Nếu lỗi, tạo lại user:
```sql
-- Kết nối bằng root
mysql -u root -p

DROP USER IF EXISTS 'iot_managerIoT'@'localhost';
CREATE USER 'iot_managerIoT'@'localhost' IDENTIFIED BY 'iot_managerIoTpassword';
GRANT ALL ON iot_managerDeviceIoT.* TO 'iot_managerIoT'@'localhost';
FLUSH PRIVILEGES;
EXIT;
```

### Lỗi: `JWT_SECRET must be at least 32 characters`

Backend crash do JWT_SECRET trong `.env` quá ngắn. Sửa:
```
JWT_SECRET=local_dev_secret_key_change_in_production_32chars
```
Phải đủ **32 ký tự trở lên**.

### Lỗi: `Cannot connect to MQTT broker`

Mosquitto chưa chạy hoặc sai port.

```powershell
# Kiểm tra port 1883 (Broker 1) và 8883 (Broker 2, TLS) có mở không
Get-NetTCPConnection -LocalPort 1883 -ErrorAction SilentlyContinue
Get-NetTCPConnection -LocalPort 8883 -ErrorAction SilentlyContinue
# Nếu không thấy gì → Mosquitto chưa chạy → chạy lại Terminal 2 và/hoặc Terminal 3
```

Port mở nhưng backend log `[mqttData] error: ...` → lỗi TLS. Kiểm tra bằng Git Bash: `bash scripts/check_mqtt_tls.sh localhost 8883`

| Lỗi backend | Nguyên nhân | Cách sửa |
|---|---|---|
| `self-signed certificate in certificate chain` | `MQTT_CA_FILE` trỏ tới CA khác CA đã ký cert broker | Trỏ về `mosquitto/certs/ca.crt` hiện tại; khởi động lại broker sau khi sinh cert |
| `Hostname/IP does not match certificate's altnames` | `MQTT_HOST` không có trong SAN của cert | Chạy lại `gen_mqtt_certs.sh` kèm host đó, hoặc dùng `localhost` |
| `connect ECONNREFUSED ...:1884` | `.env` cũ còn `MQTT_PORT=1884` (cổng plaintext đã bỏ) | `MQTT_PORT=8883` |

### Lỗi Frontend: `Failed to fetch` / API trả về 500

Frontend không gọi được Backend.

Kiểm tra file `frontend/.env.local`:
```
BACKEND_URL=http://localhost:5000
```
Sau khi sửa `.env.local`, cần **restart** `npm run dev` của frontend (Next.js không hot-reload env).

### Lỗi: `Port 300x already in use` (3001/3002/3003)

```powershell
# Tìm process đang dùng cổng (ví dụ 3001)
Get-NetTCPConnection -LocalPort 3001 | Select-Object OwningProcess
# Lấy PID rồi kill
Stop-Process -Id <PID> -Force
```

### Lỗi: `Table doesn't exist`

Schema chưa được import. Chạy lại:
```powershell
cd e:\WorkSpace\managerDeviceIoT
mysql -u iot_managerIoT -piot_managerIoTpassword iot_managerDeviceIoT `
      < database\migrations\001_schema.sql
```

---

## Lệnh hữu ích trong quá trình phát triển

```powershell
# Xem dữ liệu sensor mới nhất trong DB
mysql -u iot_managerIoT -piot_managerIoTpassword iot_managerDeviceIoT `
      -e "SELECT * FROM sensor_data ORDER BY received_at DESC LIMIT 5;"

# Xem audit log
mysql -u iot_managerIoT -piot_managerIoTpassword iot_managerDeviceIoT `
      -e "SELECT event_type, ip_address, details, created_at FROM audit_log ORDER BY created_at DESC LIMIT 10;"

# Xem trạng thái thiết bị
mysql -u iot_managerIoT -piot_managerIoTpassword iot_managerDeviceIoT `
      -e "SELECT device_id, device_type, status, fail_count, last_seen FROM devices;"

# Reset fail_count và unblock thiết bị bằng SQL (thay thế nút Unlock trên UI)
mysql -u iot_managerIoT -piot_managerIoTpassword iot_managerDeviceIoT `
      -e "UPDATE devices SET status='active', fail_count=0 WHERE device_id='ESP32-GW-XXXXXXXX';"
```
