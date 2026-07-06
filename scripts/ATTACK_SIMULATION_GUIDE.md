# Huong dan chay mo phong tan cong IoT

Tai lieu nay huong dan chay demo tu dau: khoi dong Docker, chay Backend/Frontend,
nap firmware ESP32, dang ky thiet bi, va chay script mo phong tan cong.

File nay duoc viet dua tren cac script hien co:

- `scripts/setup.sh`
- `scripts/setup.bat`
- `scripts/attack_demo.sh`          – 5 kich ban tan cong quan trong nhat
- `scripts/attack_demo_extended.sh` – 6 kich ban nang cao bo sung

> Luu y: Cac kich ban tan cong chi dung cho moi truong lab/local cua du an nay.
> Khong chay vao he thong khong thuoc quyen so huu cua ban.

---

## 1. Tong quan thu tu demo

```text
1. Khoi dong Docker Desktop
2. Chay scripts/setup.bat hoac scripts/setup.sh
3. Kiem tra Backend, Frontend, MySQL, Mosquitto
4. Dang nhap Dashboard
5. Tao Gateway va Sensor, luu device_id + secret_key
6. Chuyen Gateway va Sensor sang active
7. Sua config firmware Gateway va Sensor
8. Nap firmware Gateway
9. Nap firmware Sensor
10. Xac nhan Sensor -> MQTT -> Gateway -> Backend co data
11a. Chay scripts/attack_demo.sh de mo phong 5 kich ban quan trong nhat
11b. Chay scripts/attack_demo_extended.sh de mo phong 6 kich ban nang cao
12. Xem Audit Log va reset thiet bi neu bi blocked
```

---

## 2. Yeu cau truoc khi chay

### 2.1 Phan mem

Can co:

- Docker Desktop
- Git Bash, WSL, hoac terminal co Bash de chay `attack_demo.sh`
- `curl`
- `openssl`
- `python3` (de parse JSON response trong Scenario 9 va 10)
- PlatformIO IDE trong VS Code hoac PlatformIO CLI
- Driver USB cho ESP32 neu Windows chua nhan cong COM

Neu chi chay web/backend bang Docker, khong can cai Node.js tren may host.

### 2.2 Phan cung firmware

Toi thieu:

- 1 ESP32 Gateway
- 1 ESP32 Sensor
- 1 cam bien DHT22 cho Sensor
- Day USB, day jumper
- Dien tro pull-up 10k tu DATA cua DHT22 len 3.3V

### 2.3 Cong mac dinh

| Service | Cong/URL |
|---|---|
| Nginx | `http://localhost` |
| Frontend | `http://localhost:3000` |
| Backend | `http://localhost:5000` |
| Backend health | `http://localhost:5000/api/health` |
| MySQL tren host | `localhost:3308` |
| MQTT Broker 1 (Sensor↔GW) | `localhost:1883` |
| MQTT Broker 2 (GW→Backend) | `localhost:1884` |

---

## 3. Cach 1 - Khoi dong bang Docker script

Day la cach khuyen dung de demo nhanh.

### 3.1 Windows

Mo PowerShell hoac CMD tai thu muc goc repo:

```powershell
cd E:\WorkSpace\managerDeviceIoT
scripts\setup.bat
```

`setup.bat` se:

- Kiem tra Docker co trong PATH.
- Kiem tra Docker daemon dang chay.
- Kiem tra `docker-compose` hoac `docker compose`.
- Tao `backend\.env` tu `backend\.env.example` neu chua co.
- Chay `docker compose up --build -d`.

### 3.2 Linux, macOS, WSL, Git Bash

```bash
cd /e/WorkSpace/managerDeviceIoT
bash scripts/setup.sh
```

`setup.sh` lam cac viec tuong tu `setup.bat`:

- Kiem tra Docker.
- Kiem tra Docker Compose.
- Tao `backend/.env` neu chua co.
- Chay `docker compose up --build -d`.

### 3.3 Luu y ve mat khau dang nhap

Hai script setup hien dang in:

```text
admin / 123456
```

Nhung schema hien tai seed tai khoan:

```text
admin / admin123
```

Khi demo, dung:

```text
Username: admin
Password: admin123
```

---

## 4. Kiem tra Docker services

Sau khi chay setup:

```powershell
docker compose ps
```

Can thay cac container chay:

- `iot-mysql`
- `iot-mqtt-broker-1`
- `iot-mqtt-broker-2`
- `iot-nginx`
- `iot-backend`
- `iot-frontend`

Kiem tra Backend:

```powershell
curl http://localhost:5000/api/health
```

Kiem tra log neu co loi:

```powershell
docker compose logs -f backend
docker compose logs -f frontend
docker compose logs -f mysql
docker compose logs -f mqtt-broker-1
docker compose logs -f mqtt-broker-2
```

Dung toan bo stack:

```powershell
docker compose down
```

Build lai sau khi sua code:

```powershell
docker compose up -d --build
```

---

## 5. Cach 2 - Chay Backend va Frontend rieng

Dung cach nay khi muon debug code Node/Next truc tiep tren may host. Van co the
dung Docker chi cho MySQL va Mosquitto, hoac cai MySQL/Mosquitto local rieng.

### 5.1 Chay MySQL va MQTT Broker bang Docker

Neu muon chi dung Docker cho ha tang:

```powershell
docker compose up -d mysql mqtt-broker-1 mqtt-broker-2
```

Voi cach nay, tren host:

- MySQL la `localhost:3308`
- MQTT Broker 1 (Sensor↔Gateway) la `localhost:1883`
- MQTT Broker 2 (Gateway→Backend) la `localhost:1884`

### 5.2 Cau hinh Backend local

Tao hoac sua `backend\.env`:

```env
PORT=5000

DB_HOST=localhost
DB_PORT=3308
DB_USER=iot_managerIoT
DB_PASS=iot_managerIoTpassword
DB_NAME=iot_managerDeviceIoT

JWT_SECRET=local_dev_secret_key_change_in_production_32chars

MQTT_HOST=localhost
MQTT_PORT=1884

FRONTEND_URL=http://localhost:3000

ADMIN_USERNAME=admin
ADMIN_PASSWORD=admin123
```

> Neu MySQL chay local ngoai Docker o cong `3306`, doi `DB_PORT=3306`.

Chay Backend:

```powershell
cd E:\WorkSpace\managerDeviceIoT\backend
npm install
npm run dev
```

Kiem tra:

```powershell
curl http://localhost:5000/api/health
```

### 5.3 Cau hinh Frontend local

Tao hoac sua `frontend\.env.local`:

```env
BACKEND_URL=http://localhost:5000
NEXT_PUBLIC_APP_NAME=IoT Device Manager
```

Chay Frontend:

```powershell
cd E:\WorkSpace\managerDeviceIoT\frontend
npm install
npm run dev
```

Mo:

```text
http://localhost:3000
```

---

## 6. Dang ky thiet bi demo

Mo Dashboard:

```text
http://localhost:3000
```

Dang nhap:

```text
admin / admin123
```

Tao 2 thiet bi:

| Thiet bi | Type | Ten goi y |
|---|---|---|
| Gateway | `gateway` | `Demo Gateway` |
| Sensor | `sensor` | `Demo Sensor` |

Sau khi tao, Dashboard tra ve:

- `device_id`
- `secret_key`

Sao chep ngay cac gia tri nay:

```text
GW_ID=ESP32-GW-...
GW_SECRET=...
SN_ID=ESP32-SN-...
SN_SECRET=...
```

Thiet bi moi co status `inactive`. Truoc khi chay demo, chuyen ca Gateway va
Sensor sang:

```text
active
```

---

## 7. Lay IP may chay Docker

ESP32 can truy cap duoc may dang chay Docker qua LAN.

Tren Windows:

```powershell
ipconfig
```

Tim `IPv4 Address` cua card WiFi, vi du:

```text
192.168.1.100
```

Dung IP nay cho:

- `MQTT_HOST`
- `BACKEND_URL`

May tinh va ESP32 phai cung mang WiFi/LAN.

---

## 8. Cau hinh va nap firmware Gateway

Mo file:

```text
firmware/gateway-node/include/config_gw.h
```

Sua cac gia tri:

```cpp
#define GW_DEVICE_ID   "ESP32-GW-..."
#define GW_SECRET_KEY  "..."

#define WIFI_SSID      "ten-wifi"
#define WIFI_PASS      "mat-khau-wifi"

// Broker 1 - Subscribe nhan du lieu tu Sensor
#define MQTT_BROKER1_HOST  "192.168.1.100"
#define MQTT_BROKER1_PORT  1883

// Broker 2 - Publish du lieu len Backend
#define MQTT_BROKER2_HOST  "192.168.1.100"
#define MQTT_BROKER2_PORT  1884

#define BACKEND_URL    "http://192.168.1.100:3000/api/device/data"
```

Co the doi `BACKEND_URL` thanh backend truc tiep:

```cpp
#define BACKEND_URL    "http://192.168.1.100:5000/api/device/data"
```

Them Sensor vao whitelist cua Gateway:

```cpp
static const SensorCredential KNOWN_SENSORS[] = {
    { "ESP32-SN-...", "SN_SECRET_64_HEX" },
};
```

Nap firmware Gateway bang PlatformIO CLI:

```powershell
cd E:\WorkSpace\managerDeviceIoT\firmware\gateway-node
pio run --target upload
pio device monitor -b 115200
```

Hoac mo thu muc `firmware/gateway-node` bang VS Code PlatformIO va bam `Upload`.

Ket qua mong doi trong Serial Monitor:

```text
IoT Gateway Node - Starting
Gateway ID : ESP32-GW-...
Backend URL: http://192.168.1.100:3000/api/device/data
[MQTT-SUB] Broker 1: 192.168.1.100:1883
[MQTT-PUB] Broker 2: 192.168.1.100:1884
[MAIN] Ready - listening for sensor data...
```

---

## 9. Cau hinh va nap firmware Sensor

Mo file:

```text
firmware/sensor-node/include/config.h
```

Sua cac gia tri:

```cpp
#define DEVICE_ID   "ESP32-SN-..."
#define SECRET_KEY  "..."

#define WIFI_SSID   "ten-wifi"
#define WIFI_PASS   "mat-khau-wifi"

#define MQTT_HOST   "192.168.1.100"
#define MQTT_PORT   1883
```

Kiem tra chan DHT22:

```cpp
#define DHT_PIN     4
#define DHT_TYPE    DHT22
```

Nap firmware Sensor:

```powershell
cd E:\WorkSpace\managerDeviceIoT\firmware\sensor-node
pio run --target upload
pio device monitor -b 115200
```

Ket qua mong doi:

```text
IoT Sensor Node - Khoi dong
Device ID  : ESP32-SN-...
[MQTT] Published (... bytes): {"sensor_id":"ESP32-SN-...","sn_timestamp":...}
```

Gateway sau do se in:

```text
[FWD] Sensor HMAC OK
[FWD] Posting ... bytes to backend
[FWD] Backend OK (200)
```

---

## 10. Xac nhan data da ve Backend

Mo Dashboard:

```text
http://localhost:3000/dashboard
```

Kiem tra:

- Trang `Devices`: Sensor/Gateway co `last_seen` moi.
- Trang `Logs` hoac device detail: co du lieu sensor.
- Trang `Audit`: co event `DATA_RECV`.

Kiem tra truc tiep DB:

```powershell
docker exec -it iot-mysql mysql -u iot_managerIoT -piot_managerIoTpassword iot_managerDeviceIoT
```

```sql
SELECT d.device_id AS sensor, gw.device_id AS gateway, sd.payload, sd.received_at
FROM sensor_data sd
JOIN devices d ON sd.device_id = d.id
JOIN devices gw ON sd.gateway_id = gw.id
ORDER BY sd.received_at DESC
LIMIT 10;
```

---

## 11. Chay mo phong tan cong bang script – Huong dan step by step

> **Nguyen tac:** Script chay tren may HOST (Git Bash), khong phai ben trong container. Docker expose cong 5000 ra host nen script goi `localhost:5000` binh thuong.
>
> **Luong chay:** 2 script chay noi tiep nhau. **Khong reset thiet bi giua 2 script** — Scenario 7 trong script extended can Gateway dang bi block tu Scenario 3.

---

### 11. Quy trinh day du khi chay du an bang Docker

**Buoc 1 — Khoi dong Docker (PowerShell):**

```powershell
cd E:\WorkSpace\managerDeviceIoT-RBAC
docker compose up -d
docker compose ps
curl http://localhost:5000/api/health
```

Ket qua health phai la: `{"status":"ok","db":"connected","mqtt":"connected"}`

**Buoc 2 — Tao thiet bi tren Dashboard (trinh duyet):**

1. Mo `http://localhost:3000` → dang nhap `admin / admin123`
2. Vao **Devices** → **Them thiet bi** → Type = `gateway` → **Luu**
3. **SAO CHEP NGAY** `device_id` va `secret_key` (chi hien 1 lan)
4. Lap lai buoc 2-3 cho Type = `sensor`
5. Click tung thiet bi → doi Status ve `active` → Luu

**Buoc 3 — Mo Git Bash (khong phai PowerShell) va gan bien:**

```bash
export BACKEND="http://localhost:5000"
export GW_ID="ESP32-GW-..."      # device_id Gateway vua tao
export GW_SECRET="aabb...64"     # secret_key Gateway (64 ky tu hex)
export SN_ID="ESP32-SN-..."      # device_id Sensor
export SN_SECRET="1122...64"     # secret_key Sensor

# Xac nhan HMAC hoat dong — phai ra 64 ky tu hex
echo -n "${GW_ID}:$(date +%s)" | openssl dgst -sha256 -hmac "$GW_SECRET" -hex | sed 's/^.* //'
```

**Buoc 4 — Chay script core (Git Bash):**

```bash
cd /e/WorkSpace/managerDeviceIoT-RBAC
chmod +x scripts/attack_demo.sh
./scripts/attack_demo.sh "$BACKEND" "$GW_ID" "$GW_SECRET" "$SN_ID" "$SN_SECRET"
```

**Buoc 5 — Chay script extended NGAY SAU (khong unlock Gateway):**

```bash
chmod +x scripts/attack_demo_extended.sh
./scripts/attack_demo_extended.sh "$BACKEND" "$GW_ID" "$GW_SECRET" "$SN_ID" "$SN_SECRET" "admin" "admin123"
```

**Buoc 6 — Xem ket qua:**

```
http://localhost:3000/audit
```

**Buoc 7 — Reset sau demo (PowerShell):**

```powershell
docker exec -it iot-mysql mysql -u iot_managerIoT -piot_managerIoTpassword iot_managerDeviceIoT -e "UPDATE devices SET status='active', fail_count=0 WHERE device_type='gateway';"
```

**Loi thuong gap:**

| Trieu chung | Nguyen nhan | Cach xu ly |
|---|---|---|
| `bash: openssl: command not found` | Dang dung PowerShell | Mo Git Bash tu Start Menu |
| `curl: (7) Failed to connect` | Backend chua san sang | `docker compose logs -f backend` cho thay `Listening on port 5000` |
| S0 tra ve `401` | Thiet bi van `inactive` | Dashboard → Devices → doi ca 2 sang `active` |
| S9/S10 `Login admin that bai` | Sai password | Dung `admin123` khong phai `123456` |
| Quen copy `secret_key` | Key chi hien 1 lan | Xoa thiet bi → tao lai → copy ngay |

---

---

### 11.0 Kiem tra truoc khi bat dau

**Buoc 1:** Xac nhan Docker va backend dang chay:
```powershell
docker compose ps
curl http://localhost:5000/api/health
```
Ket qua `health`: `{"status":"ok","db":"connected","mqtt":"connected"}`

**Buoc 2:** Xac nhan 2 thiet bi da tao va dang `active`:
- Vao `http://localhost:3000/devices`
- Phai thay 1 gateway + 1 sensor, ca 2 badge xanh `active`

**Buoc 3:** Mo Git Bash va gan bien:
```bash
export BACKEND="http://localhost:5000"
export GW_ID="ESP32-GW-..."      # device_id Gateway tu Dashboard
export GW_SECRET="aabb...64"     # secret_key Gateway (64 ky tu hex)
export SN_ID="ESP32-SN-..."      # device_id Sensor
export SN_SECRET="1122...64"     # secret_key Sensor

# Xac nhan HMAC hoat dong
TEST_TS=$(date +%s)
HMAC_CHECK=$(echo -n "${GW_ID}:${TEST_TS}" | openssl dgst -sha256 -hmac "$GW_SECRET" -hex | sed 's/^.* //')
echo "HMAC: $HMAC_CHECK (phai bang 64 ky tu)"
```

---

### 11.1 Chay script core: 5 kich ban quan trong nhat

```bash
cd /e/WorkSpace/managerDeviceIoT
chmod +x scripts/attack_demo.sh
./scripts/attack_demo.sh "$BACKEND" "$GW_ID" "$GW_SECRET" "$SN_ID" "$SN_SECRET"
```

**Ket qua mong doi tung scenario:**

| Scenario | Noi dung | HTTP | Audit Event | Terminal in |
|---|---|---|---|---|
| S0 | Baseline hop le | `200` | `DATA_RECV` | `✓ HTTP 200` |
| S1 | Gateway HMAC gia mao | `401` | `GATEWAY_AUTH_FAIL` HMAC_MISMATCH | `✗ HTTP 401` |
| S2 | Replay −700s (HMAC dung, ts cu) | `401` | `REPLAY_ATTACK` TIMESTAMP_EXPIRED | `✗ HTTP 401` |
| S3 | Brute Force 6 lan | `401`×6 | `GATEWAY_AUTH_FAIL`×N + `DEVICE_BLOCKED` | `Lan 1..6: HTTP 401` |
| S4 | Sensor gia lam Gateway (HMAC dung) | `403` | `PRIVILEGE_ESCALATION` | `✗ HTTP 403` |

**Chi tiet output S0 (Baseline):**
```
✓ HTTP 200
  Response: {"success":true,"sensor_id":"ESP32-SN-...","received_at":"..."}
  ✓ DATA_RECV ghi vao audit_log
```
Sau S0: vao `http://localhost:3000/audit` → thay event `DATA_RECV` mau xanh.

**Chi tiet output S1 (Spoofing):**
```
✗ HTTP 401
  Response: {"error":"GATEWAY_AUTH_FAIL","reason":"HMAC_MISMATCH"}
```
Sau S1: audit co `GATEWAY_AUTH_FAIL`, Devices > fail_count Gateway tang len 1.

**Chi tiet output S2 (Replay):**
```
✗ HTTP 401
  Response: {"error":"GATEWAY_AUTH_FAIL","reason":"TIMESTAMP_EXPIRED"}
```
Sau S2: audit co `REPLAY_ATTACK`. HMAC trong payload nay DUNG ky thuat, chi bi tu choi vi ts > 300s.

**Chi tiet output S3 (Brute Force):**
```
  Lan 1: HTTP 401 | {"error":"GATEWAY_AUTH_FAIL","reason":"HMAC_MISMATCH"}
  Lan 2: HTTP 401 | {"error":"GATEWAY_AUTH_FAIL","reason":"HMAC_MISMATCH"}
  Lan 3: HTTP 401 | {"error":"GATEWAY_AUTH_FAIL","reason":"HMAC_MISMATCH"}
  Lan 4: HTTP 401 | {"error":"GATEWAY_AUTH_FAIL","reason":"HMAC_MISMATCH"}
  Lan 5: HTTP 401 | {"error":"GATEWAY_AUTH_FAIL","reason":"HMAC_MISMATCH"}
  Lan 6: HTTP 401 | {"error":"GATEWAY_AUTH_FAIL","reason":"HMAC_MISMATCH"}
```
Sau S3: Dashboard Devices → Gateway hien badge do `Blocked`. Audit co `DEVICE_BLOCKED`.
⚠️ **KHONG reset Gateway** — S7 (script extended) can Gateway dang blocked.

**Chi tiet output S4 (Privilege Escalation):**
```
✗ HTTP 403
  Response: {"error":"INVALID_DEVICE_TYPE","detail":"gateway_id must be a gateway device"}
  ✓ HMAC Layer1+Layer2: PASS | RBAC: device_type='sensor' ≠ 'gateway' → 403
```
Sau S4: audit co `PRIVILEGE_ESCALATION`. HTTP 403 (co danh tinh, sai quyen) khac 401 (chua xac thuc).

---

### 11.2 Chay script nang cao: 6 kich ban bo sung

Chay ngay tiep theo, khong lam gi khac:

```bash
chmod +x scripts/attack_demo_extended.sh
./scripts/attack_demo_extended.sh \
  "$BACKEND" \
  "$GW_ID" "$GW_SECRET" \
  "$SN_ID" "$SN_SECRET" \
  "admin" "admin123"
```

**Ket qua mong doi tung scenario:**

| Scenario | Noi dung | HTTP | Audit Event | Dieu kien dac biet |
|---|---|---|---|---|
| S5 | Sensor HMAC gia mao (Layer 2) | `401` | `SENSOR_AUTH_FAIL` | gw_hmac dung, sn_hmac gia |
| S6 | Replay +700s (HMAC dung, ts tuong lai) | `401` | `REPLAY_ATTACK` | Chung minh ±300s ca 2 chieu |
| S7 | Blocked device HMAC dung | `403` | — | Can Gateway dang blocked tu S3 |
| S8 | Unregistered device (fake ID) | `401` | `GATEWAY_AUTH_FAIL` NOT_FOUND | — |
| S9 | Inactive device qua Admin API | `403` | — | Script tu dong patch + restore |
| S10 | Viewer goi admin REST API | `403` | — | Script tu tao + xoa viewer tam |

**Chi tiet output S5 (Sensor Layer 2):**
```
✗ HTTP 401
  Response: {"error":"SENSOR_AUTH_FAIL","reason":"HMAC_MISMATCH"}
  ✓ gw_hmac PASS → sn_hmac FAIL → 401 SENSOR_AUTH_FAIL
```
Sau S5: audit co `SENSOR_AUTH_FAIL`. Chung minh 2 lop HMAC doc lap.

**Chi tiet output S6 (Replay tuong lai):**
```
✗ HTTP 401
  Response: {"error":"GATEWAY_AUTH_FAIL","reason":"TIMESTAMP_EXPIRED"}
  ✓ HMAC dung nhung ts − now > 300s → REPLAY_ATTACK
```

**Chi tiet output S7 (Blocked device HMAC dung):**
```
✗ HTTP 403
  Response: {"error":"DEVICE_BLOCKED","detail":"Gateway is blocked"}
  ✓ HMAC PASS → status check: 'blocked' → 403 DEVICE_BLOCKED
```
Neu ra 200: Gateway da duoc unlock truoc do → S7 khong demo duoc. Chay lai tu S3.

**Chi tiet output S8 (Unregistered):**
```
✗ HTTP 401
  Response: {"error":"GATEWAY_AUTH_FAIL","reason":"NOT_FOUND"}
  ✓ Device lookup failed → 401 GATEWAY_AUTH_FAIL (NOT_FOUND)
```

**Chi tiet output S9 (Inactive — 4 buoc tu dong):**
```
  Buoc 1: Login admin...
  device.id = 3
  Buoc 2: Deactivate device ESP32-GW-...
  PATCH status → HTTP 200
  Buoc 3: Gui data tu device inactive (HMAC dung)...
✗ HTTP 403
  Response: {"error":"DEVICE_NOT_ACTIVE","detail":"Gateway is not active"}
  Buoc 4 (cleanup): Reactivate device ESP32-GW-...
  PATCH status='active' → HTTP 200
  ✓ Device da duoc khoi phuc ve trang thai active
```
Neu in `Login admin that bai`: kiem tra tham so `admin`/`admin123` hoac chay `curl -X POST $BACKEND/api/auth/login -H "Content-Type: application/json" -d '{"username":"admin","password":"admin123"}'`.

**Chi tiet output S10 (RBAC REST API — 3 test):**
```
  Tao viewer 'demo_viewer_...' → HTTP 201
  Test 2: GET /api/audit-log → HTTP 200 (viewer co quyen doc)
  Test 3: DELETE /api/audit-log/data-recv → HTTP 403 FORBIDDEN
  Test 4: GET /api/users → HTTP 403 FORBIDDEN (admin-only)
  DELETE user/5 → HTTP 200 (cleanup)
  ✓ Viewer tam da duoc xoa
```

---

### 11.3 Kiem tra ket qua tong the

Mo `http://localhost:3000/audit` — phai thay du 7 loai event:

```
DATA_RECV                 (S0)
GATEWAY_AUTH_FAIL HMAC_MISMATCH  (S1, S3)
REPLAY_ATTACK TIMESTAMP_EXPIRED  (S2, S6)
DEVICE_BLOCKED            (S3)
PRIVILEGE_ESCALATION      (S4)
SENSOR_AUTH_FAIL HMAC_MISMATCH   (S5)
GATEWAY_AUTH_FAIL NOT_FOUND      (S8)
```

Kiem tra DB:
```powershell
docker exec -it iot-mysql mysql -u iot_managerIoT -piot_managerIoTpassword iot_managerDeviceIoT -e "SELECT event_type, COUNT(*) FROM audit_log GROUP BY event_type ORDER BY COUNT(*) DESC;"
```

---

## 12. Xem ket qua mo phong

### 12.1 Xem Audit tren Dashboard

Mo:

```text
http://localhost:3000/audit
```

Can thay cac event sau khi chay du 11 scenario (2 script):

- `DATA_RECV` (S0 — core)
- `GATEWAY_AUTH_FAIL` + reason `HMAC_MISMATCH` (S1 core, S3 extended)
- `REPLAY_ATTACK` + reason `TIMESTAMP_EXPIRED` (S2 core, S6 extended)
- `DEVICE_BLOCKED` (S3 core — sau 5 lan brute force)
- `PRIVILEGE_ESCALATION` (S4 core)
- `SENSOR_AUTH_FAIL` + reason `HMAC_MISMATCH` (S5 extended)
- `GATEWAY_AUTH_FAIL` + reason `NOT_FOUND` (S8 extended)

### 12.2 Xem log Backend

```powershell
docker compose logs -f backend
```

### 12.3 Xem DB

```powershell
docker exec -it iot-mysql mysql -u iot_managerIoT -piot_managerIoTpassword iot_managerDeviceIoT
```

```sql
SELECT event_type, device_id, ip_address, details, created_at
FROM audit_log
ORDER BY created_at DESC
LIMIT 30;

SELECT device_id, device_type, status, fail_count, last_seen
FROM devices
ORDER BY created_at DESC;
```

---

## 13. Reset sau khi demo

Scenario 3 (attack_demo.sh) se lam Gateway bi `blocked`. Script extended chay NGAY SAU do khong can reset giua 2 script — Scenario 7 can Gateway dang blocked. Chi reset sau khi ca 2 script chay xong. Scenario 9 tu dong reactivate thiet bi, Scenario 10 tu dong xoa viewer tam thoi.

### 13.1 Reset bang Dashboard

Vao `Devices`, chon thiet bi bi block, doi status ve:

```text
active
```

### 13.2 Reset bang SQL

```powershell
docker exec -it iot-mysql mysql -u iot_managerIoT -piot_managerIoTpassword iot_managerDeviceIoT
```

```sql
UPDATE devices
SET status = 'active', fail_count = 0
WHERE device_id IN ('ESP32-GW-...', 'ESP32-SN-...');
```

---

## 14. Loi thuong gap

### Docker daemon chua chay

Loi tu `setup.bat` hoac `setup.sh`:

```text
Docker daemon chua chay
```

Cach xu ly:

- Mo Docker Desktop.
- Doi den khi Docker bao `Running`.
- Chay lai script setup.

### Dang nhap sai mat khau

Neu setup script in `admin / 123456`, bo qua dong nay. Dung:

```text
admin / admin123
```

### Backend khong ket noi DB

Kiem tra container MySQL:

```powershell
docker compose ps mysql
docker compose logs mysql
```

Neu chay Backend local voi MySQL Docker, nho dung:

```env
DB_PORT=3308
```

### ESP32 khong gui duoc MQTT

Kiem tra:

- ESP32 va may Docker cung mang WiFi.
- `MQTT_BROKER1_HOST` / `MQTT_BROKER2_HOST` la IP LAN cua may, khong phai `localhost`.
- Cong `1883` (Broker 1) va `1884` (Broker 2) khong bi firewall chan.
- Ca hai container `iot-mqtt-broker-1` va `iot-mqtt-broker-2` dang chay.

### Gateway forward fail

Kiem tra:

- `BACKEND_URL` dung IP LAN va dung endpoint `/api/device/data`.
- Neu dung `:3000`, frontend container phai chay.
- Neu dung `:5000`, backend container phai expose duoc cong 5000.
- Gateway co dung `GW_DEVICE_ID` va `GW_SECRET_KEY`.
- Sensor co trong `KNOWN_SENSORS`.

### Request hop le van bi `DEVICE_NOT_ACTIVE`

Thiet bi moi dang ky mac dinh la `inactive`. Vao Dashboard doi ca Gateway va
Sensor sang `active`.

---

## 15. Lenh nhanh cho buoi demo

```powershell
cd E:\WorkSpace\managerDeviceIoT
scripts\setup.bat
docker compose ps
curl http://localhost:5000/api/health
```

Mo Dashboard:

```text
http://localhost:3000
admin / admin123
```

Chay attack script tu Git Bash:

```bash
cd /e/WorkSpace/managerDeviceIoT

export GW_ID="ESP32-GW-..."
export GW_SECRET="..."
export SN_ID="ESP32-SN-..."
export SN_SECRET="..."

# 5 kich ban quan trong nhat (curl + openssl)
./scripts/attack_demo.sh "http://localhost:5000" "$GW_ID" "$GW_SECRET" "$SN_ID" "$SN_SECRET"

# Reset Gateway bi block, sau do chay tiep:
# 6 kich ban nang cao (them python3)
./scripts/attack_demo_extended.sh "http://localhost:5000" "$GW_ID" "$GW_SECRET" "$SN_ID" "$SN_SECRET" "admin" "admin123"
```

Xem audit:

```text
http://localhost:3000/audit
```
