# Hướng Dẫn Chạy Local (Không Dùng Docker)

> Chạy toàn bộ hệ thống trực tiếp trên máy Windows, không cần Docker Desktop.
> Mỗi service chạy trong **một terminal riêng**.

---

## Tổng quan — 5 service cần chạy

```
Terminal 1: MySQL 8.0             (database, port 3306)
Terminal 2: Mosquitto Broker 1    (Sensor ↔ Gateway, port 1883)
Terminal 3: Mosquitto Broker 2    (Gateway → Backend, port 1884)
Terminal 4: Backend Express       (API,      port 5000)
Terminal 5: Frontend Next.js      (UI,       port 3000)
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

Kết quả mong đợi:
```
+-----------------------------+
| Tables_in_iot_managerDevi.. |
+-----------------------------+
| audit_log                   |
| device_tokens               |
| devices                     |
| sensor_data                 |
| users                       |
+-----------------------------+
```

> File SQL đã bao gồm sẵn lệnh tạo user `admin` với password `admin123`. Bước seed ở dưới chỉ cần chạy **nếu** bảng `users` trống.

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

### Tạo file config cho Broker 2 (Gateway → Backend, port 1884)

Tạo file `mosquitto\broker2_local.conf`:

```powershell
# Tạo file config Broker 2
@'
listener 1884
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

### Mở Terminal 3 — chạy Broker 2 (port 1884)

```powershell
& "C:\Program Files\mosquitto\mosquitto.exe" `
    -c "e:\WorkSpace\managerDeviceIoT-RBAC\mosquitto\broker2_local.conf" `
    -v
```

Output mong đợi:
```
1749383000: mosquitto version 2.x.x starting
1749383000: Opening ipv4 listen socket on port 1884.
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

# MQTT Broker 2 (Gateway → Backend layer)
MQTT_HOST=localhost
MQTT_PORT=1884

# CORS
FRONTEND_URL=http://localhost:3000

# Admin default (dùng cho seed)
ADMIN_USERNAME=admin
ADMIN_PASSWORD=admin123
'@ | Out-File -Encoding utf8 .env
```

> **Quan trọng:** Khi chạy local, `DB_HOST=localhost` và `MQTT_HOST=localhost` với `MQTT_PORT=1884` (kết nối Broker 2).
> Khác với Docker: `MQTT_HOST=mqtt-broker-2` và `MQTT_PORT=1883` (cổng nội bộ Docker network).

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
[MQTT] Connected to broker at localhost:1884
[Server] Listening on port 5000
```

Kiểm tra nhanh backend đang chạy:
```powershell
# Mở tab PowerShell khác
curl http://localhost:5000/api/health
# {"status":"ok","db":"connected","mqtt":"connected"}
```

> Để terminal này **mở suốt**. `ts-node-dev` tự restart khi bạn sửa code backend.

---

## Bước 5 — Cấu hình và chạy Frontend

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
NEXT_PUBLIC_APP_NAME=IoT Device Manager
'@ | Out-File -Encoding utf8 .env.local
```

> `BACKEND_URL` là URL backend dùng phía server (Next.js proxy). Frontend trình duyệt gọi API qua route `/api/[...path]` → proxy tự forward sang `http://localhost:5000`.

### Cài dependencies

```powershell
npm install
```

Lần đầu khoảng 2–3 phút (Next.js nặng hơn backend).

### Chạy Frontend

```powershell
npm run dev
```

Output mong đợi:
```
  ▲ Next.js 16.2.5
  - Local:        http://localhost:3000
  - Network:      http://192.168.x.x:3000

 ✓ Starting...
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

# Frontend
try {
    $r = Invoke-WebRequest -Uri "http://localhost:3000" -UseBasicParsing -TimeoutSec 5
    Write-Host "[Frontend]  OK — HTTP $($r.StatusCode)" -ForegroundColor Green
} catch {
    Write-Host "[Frontend]  FAIL" -ForegroundColor Red
}

# Mosquitto Broker 1 (Sensor ↔ Gateway)
$mqtt1 = Get-NetTCPConnection -LocalPort 1883 -ErrorAction SilentlyContinue
if ($mqtt1) {
    Write-Host "[Broker 1]  OK — port 1883 đang mở" -ForegroundColor Green
} else {
    Write-Host "[Broker 1]  FAIL — port 1883 chưa mở" -ForegroundColor Red
}

# Mosquitto Broker 2 (Gateway → Backend)
$mqtt2 = Get-NetTCPConnection -LocalPort 1884 -ErrorAction SilentlyContinue
if ($mqtt2) {
    Write-Host "[Broker 2]  OK — port 1884 đang mở" -ForegroundColor Green
} else {
    Write-Host "[Broker 2]  FAIL — port 1884 chưa mở" -ForegroundColor Red
}
```

### Truy cập ứng dụng

Mở trình duyệt:

| Service | URL |
|---|---|
| **Frontend (Web App)** | http://localhost:3000 |
| **Backend Health** | http://localhost:5000/api/health |
| **Login** | http://localhost:3000/account/login |

**Đăng nhập:**
- Username: `admin`
- Password: `admin123`

---

## Tóm tắt thứ tự khởi động

```
Mỗi lần mở máy muốn chạy hệ thống, làm theo thứ tự này:

[Terminal 2] Mosquitto Broker 1 (Sensor ↔ Gateway, port 1883)
  & "C:\Program Files\mosquitto\mosquitto.exe" -c "e:\WorkSpace\managerDeviceIoT-RBAC\mosquitto\broker1_local.conf" -v

[Terminal 3] Mosquitto Broker 2 (Gateway → Backend, port 1884)
  & "C:\Program Files\mosquitto\mosquitto.exe" -c "e:\WorkSpace\managerDeviceIoT-RBAC\mosquitto\broker2_local.conf" -v

[Terminal 4] Backend
  cd e:\WorkSpace\managerDeviceIoT-RBAC\backend
  npm run dev

[Terminal 5] Frontend
  cd e:\WorkSpace\managerDeviceIoT-RBAC\frontend
  npm run dev

→ Mở http://localhost:3000
```

> MySQL tự chạy như Windows Service khi khởi động máy — không cần mở thêm terminal.

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
# Kiểm tra port 1883 (Broker 1) và 1884 (Broker 2) có mở không
Get-NetTCPConnection -LocalPort 1883 -ErrorAction SilentlyContinue
Get-NetTCPConnection -LocalPort 1884 -ErrorAction SilentlyContinue
# Nếu không thấy gì → Mosquitto chưa chạy → chạy lại Terminal 2 và/hoặc Terminal 3
```

### Lỗi Frontend: `Failed to fetch` / API trả về 500

Frontend không gọi được Backend.

Kiểm tra file `frontend/.env.local`:
```
BACKEND_URL=http://localhost:5000
```
Sau khi sửa `.env.local`, cần **restart** `npm run dev` của frontend (Next.js không hot-reload env).

### Lỗi: `Port 3000 already in use`

```powershell
# Tìm process đang dùng port 3000
Get-NetTCPConnection -LocalPort 3000 | Select-Object OwningProcess
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
