# Hướng Dẫn Demo: Threat Model & Kịch Bản Tấn Công

> **Mục tiêu tài liệu:** Hướng dẫn từng bước thực hiện demo 11 kịch bản tấn công trên hệ thống IoT, giải thích cơ chế kỹ thuật bên trong, và kiểm tra phản ứng của hệ thống — phục vụ báo cáo/thuyết trình môn An Toàn Hệ Thống Nhúng và IoT.

---

## Mục lục
1. [Tổng quan kiến trúc bảo mật](#1-tổng-quan-kiến-trúc-bảo-mật)
2. [Chuẩn bị trước khi demo](#2-chuẩn-bị-trước-khi-demo)
3. [Chạy script tự động (nhanh)](#3-chạy-script-tự-động-nhanh)
4. [Scenario 0 — Baseline: Request hợp lệ](#4-scenario-0--baseline-request-hợp-lệ)
5. [Scenario 1 — Gateway HMAC giả mạo (Layer 1)](#5-scenario-1--gateway-hmac-giả-mạo-layer-1)
6. [Scenario 2 — Sensor HMAC giả mạo (Layer 2)](#6-scenario-2--sensor-hmac-giả-mạo-layer-2)
7. [Scenario 3 — Replay Attack: Timestamp cũ](#7-scenario-3--replay-attack-timestamp-cũ)
8. [Scenario 4 — Replay Attack: Timestamp tương lai](#8-scenario-4--replay-attack-timestamp-tương-lai)
9. [Scenario 5 — Brute Force → Auto Block](#9-scenario-5--brute-force--auto-block)
10. [Scenario 6 — Blocked Device gửi HMAC hợp lệ](#10-scenario-6--blocked-device-gửi-hmac-hợp-lệ)
11. [Scenario 7 — Unregistered Device](#11-scenario-7--unregistered-device)
12. [Scenario 8 — Privilege Escalation: Sensor giả làm Gateway](#12-scenario-8--privilege-escalation-sensor-giả-làm-gateway)
13. [Scenario 9 — Inactive Device](#13-scenario-9--inactive-device)
14. [Scenario 10 — RBAC Violation qua REST API](#14-scenario-10--rbac-violation-qua-rest-api)
15. [Scenario SQL Injection (bonus)](#15-scenario-sql-injection-bonus)
16. [Kiểm tra Audit Log & Dashboard](#16-kiểm-tra-audit-log--dashboard)
17. [Bảng tổng kết STRIDE](#17-bảng-tổng-kết-stride)
18. [Điểm yếu còn lại & phân tích rủi ro](#18-điểm-yếu-còn-lại--phân-tích-rủi-ro)

---

## 1. Tổng quan kiến trúc bảo mật

### Luồng xác thực 2 cấp (thực tế trong code)

```
ESP32 Sensor Node                ESP32 Gateway Node              Backend Server
      │                                 │                              │
      │── MQTT publish ───────────────► │                              │
      │   {sensor_id, sn_ts,            │                              │
      │    sn_hmac, data}               │                              │
      │                                 │                              │
      │                        [Xác thực sn_hmac]                      │
      │                        (bằng whitelist local)                  │
      │                                 │                              │
      │                                 │── HTTP POST ────────────────►│
      │                                 │   {gateway_id, gw_ts,        │
      │                                 │    gw_hmac,                  │
      │                                 │    sensor_id, sn_ts,         │
      │                                 │    sn_hmac, data}            │
      │                                 │                              │
      │                                 │              [Level 1] Xác thực Gateway
      │                                 │              [Level 2] Xác thực Sensor
      │                                 │              [RBAC]   Kiểm tra device_type
      │                                 │              [Status] Kiểm tra active/blocked
      │                                 │                              │
      │                                 │◄── 200 OK / 401 / 403 ──────│
```

### Thứ tự kiểm tra trong `validateDevice` middleware

```
Nhận request POST /api/iot/data
│
├─ 1. Thiếu field? → 400 MISSING_GATEWAY_FIELDS
│
├─ 2. [Level 1] verifyGatewayHMAC(gateway_id, gw_timestamp, gw_hmac)
│       ├─ DB lookup gateway_id → không tìm thấy → NOT_FOUND
│       ├─ |now - gw_timestamp| > 300s → TIMESTAMP_EXPIRED
│       └─ timingSafeEqual(expected, gw_hmac) = false → HMAC_MISMATCH
│          → Tất cả lỗi Level 1: ghi audit GATEWAY_AUTH_FAIL, tăng fail_count
│          → fail_count ≥ 5 → DEVICE_BLOCKED
│
├─ 3. [Level 2] verifyDeviceHMAC(sensor_id, sn_timestamp, sn_hmac)
│       ├─ DB lookup sensor_id → không tìm thấy → NOT_FOUND
│       ├─ |now - sn_timestamp| > 300s → TIMESTAMP_EXPIRED
│       └─ timingSafeEqual(expected, sn_hmac) = false → HMAC_MISMATCH
│          → Tất cả lỗi Level 2: ghi audit SENSOR_AUTH_FAIL, tăng fail_count
│
├─ 4. [RBAC] gateway.device_type ≠ 'gateway' → 403 INVALID_DEVICE_TYPE
│            sensor.device_type ≠ 'sensor'   → 403 INVALID_DEVICE_TYPE
│
├─ 5. [Status] gateway.status = 'blocked' → 403 DEVICE_BLOCKED
│              sensor.status = 'blocked'  → 403 DEVICE_BLOCKED
│
└─ 6. Lưu DB + 200 OK
```

### Công thức HMAC (từ `hmacService.ts`)

```
message = device_id + ":" + unix_timestamp
token   = HMAC-SHA256(secret_key, message)
        = hex string 64 ký tự

Ví dụ:
  device_id  = "ESP32-GW-A1B2C3D4"
  timestamp  = 1749383000
  secret_key = "a3f8c2...64chars"
  message    = "ESP32-GW-A1B2C3D4:1749383000"
  token      = "7f3a9b2c..." (64 hex chars)
```

---

## 2. Chuẩn bị trước khi demo (chạy bằng Docker)

> **Nguyên tắc quan trọng:** Các container Docker chạy backend/frontend/DB. Script tấn công (`attack_demo.sh`) chạy **trên máy host** trong **Git Bash** (không phải PowerShell, không phải bên trong container). Script gửi HTTP request đến `localhost:5000` — cổng mà Docker đã expose ra host.

---

### 2.1 — Khởi động Docker

Mở **PowerShell** hoặc **CMD**, chạy:

```powershell
cd E:\WorkSpace\managerDeviceIoT-RBAC
docker compose up -d --build
```

Đợi ~60 giây để các container khởi động xong, rồi kiểm tra:

```powershell
docker compose ps
```

Kết quả mong đợi — tất cả status `running` hoặc `healthy`:

```
NAME                  STATUS              PORTS
iot-mysql             running (healthy)   0.0.0.0:3308->3306/tcp
iot-mqtt-broker-1     running             0.0.0.0:1883->1883/tcp
iot-mqtt-broker-2     running             0.0.0.0:1884->1884/tcp
iot-backend           running (healthy)   0.0.0.0:5000->5000/tcp
iot-frontend          running             0.0.0.0:3000->3000/tcp
iot-nginx             running             0.0.0.0:80->80/tcp
```

Xác nhận backend sẵn sàng:

```powershell
curl http://localhost:5000/api/health
```

Kết quả mong đợi:
```json
{"status":"ok","db":"connected","mqtt":"connected"}
```

Nếu `db: disconnected` → `docker compose logs backend` để xem lỗi.
Nếu container nào `exited` → `docker compose up -d <tên-container>` để khởi động lại.

---

### 2.2 — Tạo thiết bị demo trên Dashboard

Mở trình duyệt → `http://localhost:3000` → đăng nhập `admin / admin123`

**Tạo Gateway:**
1. Vào **Devices** → click **Thêm thiết bị**
2. Điền: Tên = `Demo-Gateway-01`, Type = `gateway`, Location = `Lab`
3. Click **Lưu** → Modal hiện `device_id` và `secret_key`
4. **SAO CHÉP NGAY cả 2 giá trị** — `secret_key` chỉ hiện đúng 1 lần, không thể xem lại

**Tạo Sensor:**
1. Vào **Devices** → click **Thêm thiết bị**
2. Điền: Tên = `Demo-Sensor-01`, Type = `sensor`, Location = `Lab`
3. Click **Lưu** → SAO CHÉP `device_id` và `secret_key`

**Kích hoạt cả 2 thiết bị:**
- Thiết bị mới mặc định status = `inactive`
- Click từng thiết bị → đổi Status → `active` → **Lưu**
- Xác nhận badge chuyển xanh trước khi chạy script

> Nếu quên copy `secret_key`: xóa thiết bị → tạo lại → copy ngay.

---

### 2.3 — Mở Git Bash và gán biến môi trường

> ⚠️ **Phải dùng Git Bash** (không phải PowerShell). Tìm trong Start Menu: `Git Bash`. Script dùng cú pháp bash — PowerShell không tương thích.

Mở **Git Bash**, điền giá trị thực tế từ bước 2.2:

```bash
export BACKEND="http://localhost:5000"
export GW_ID="ESP32-GW-XXXXXXXX"      # device_id của Gateway vừa tạo
export GW_SECRET="aabbcc...64chars"   # secret_key của Gateway (64 ký tự hex)
export SN_ID="ESP32-SN-XXXXXXXX"      # device_id của Sensor
export SN_SECRET="112233...64chars"   # secret_key của Sensor (64 ký tự hex)
```

**Xác nhận biến đúng và HMAC hoạt động:**

```bash
# Kiểm tra biến đã gán
echo "GW_ID    : $GW_ID"
echo "SN_ID    : $SN_ID"
echo "Backend  : $BACKEND"

# Tính thử HMAC — phải ra đúng 64 ký tự hex
TEST_TS=$(date +%s)
HMAC_OUT=$(echo -n "${GW_ID}:${TEST_TS}" | openssl dgst -sha256 -hmac "$GW_SECRET" -hex | sed 's/^.* //')
echo "HMAC test: $HMAC_OUT"
echo "Độ dài   : ${#HMAC_OUT} ký tự  ← phải bằng 64"
```

Nếu `Độ dài: 64` → OK, tiếp tục sang bước 2.4.
Nếu ra `0` hoặc chuỗi rỗng → GW_SECRET sai định dạng (thừa space, newline, hoặc chưa gán).

---

### 2.4 — Dán hàm tiện ích vào terminal (tùy chọn — dùng khi demo thủ công)

Dùng khi muốn gửi từng request riêng lẻ để giải thích, không cần thiết khi chạy script tự động.

```bash
# Tính HMAC-SHA256 — backend dùng secret_key hex string trực tiếp, không decode sang binary
hmac() {
    local key="$1" msg="$2"
    echo -n "$msg" | openssl dgst -sha256 -hmac "$key" -hex 2>/dev/null \
        | sed 's/^.* //'
}

ts() { date +%s; }

post_data() {
    local payload="$1"
    response=$(curl -s -w '\n%{http_code}' -X POST "$BACKEND/api/device/data" \
        -H "Content-Type: application/json" -d "$payload")
    http_code=$(echo "$response" | tail -n1)
    body=$(echo "$response" | head -n -1)
    echo "HTTP $http_code"
    echo "$body" | python3 -m json.tool 2>/dev/null || echo "$body"
}

# Kiểm tra nhanh
echo "HMAC OK: $(hmac "$GW_SECRET" "${GW_ID}:$(ts)")"
```

---

### 2.5 — Lỗi thường gặp khi chạy với Docker

| Triệu chứng | Nguyên nhân | Cách xử lý |
|---|---|---|
| `bash: openssl: command not found` | Đang dùng PowerShell thay vì Git Bash | Mở Git Bash từ Start Menu |
| `curl: (7) Failed to connect to localhost:5000` | Container backend chưa sẵn sàng | `docker compose logs -f backend` chờ thấy `Listening on port 5000` |
| `{"status":"ok","db":"disconnected"}` | MySQL container chưa healthy | `docker compose ps mysql` → đợi thêm 30s |
| S0 trả về `401` dù credentials đúng | Thiết bị vẫn `inactive` | Vào Dashboard → Devices → đổi cả 2 sang `active` |
| S9/S10 in `Login admin thất bại` | Sai password | Password mặc định là `admin123` không phải `123456` |
| Quên copy `secret_key` | Key chỉ hiện 1 lần khi tạo | Xóa thiết bị → tạo lại → copy ngay |
| Script chạy nhưng không có màu | Terminal không hỗ trợ ANSI | Chạy trong Git Bash hoặc Windows Terminal |

---

## 3. Chạy script tự động – Hướng dẫn step by step

> **Tổng quan:** Có 2 script chạy nối tiếp nhau. Script 1 (`attack_demo.sh`) chạy 5 kịch bản core. Script 2 (`attack_demo_extended.sh`) chạy 6 kịch bản nâng cao. **Không reset thiết bị giữa 2 script** — Scenario 7 trong script 2 cần Gateway vẫn đang bị block từ Scenario 3.

---

### 3.0 — Pre-flight: Kiểm tra trước khi bắt đầu

Kiểm tra đủ 4 điều kiện này trước khi gõ bất kỳ lệnh nào:

**[1] Docker đang chạy và đủ container:**
```powershell
docker compose ps
```
Kết quả mong đợi — tất cả status `running` hoặc `healthy`:
```
NAME                  STATUS
iot-mysql             running (healthy)
iot-mqtt-broker-1     running
iot-mqtt-broker-2     running
iot-backend           running (healthy)
iot-frontend          running
iot-nginx             running
```
Nếu container nào `exited`: `docker compose up -d <tên-container>`

**[2] Backend phản hồi bình thường:**
```powershell
curl http://localhost:5000/api/health
```
Kết quả mong đợi:
```json
{"status":"ok","db":"connected","mqtt":"connected"}
```
Nếu DB disconnected → `docker compose logs backend` để xem lỗi.

**[3] Hai thiết bị đã tạo và đang active:**
- Vào **http://localhost:3000** → **Devices**
- Phải thấy 1 thiết bị `gateway` + 1 thiết bị `sensor`, cả 2 badge xanh `active`
- Nếu badge xám `inactive` → click thiết bị → đổi status → **Lưu**

**[4] Đã có giá trị GW_ID, GW_SECRET, SN_ID, SN_SECRET:**
```bash
echo "GW_ID   : $GW_ID"
echo "GW_SECRET: ${GW_SECRET:0:8}..."
echo "SN_ID   : $SN_ID"
echo "SN_SECRET: ${SN_SECRET:0:8}..."
```
Nếu ra rỗng → xem mục 3.1 bên dưới.

---

### 3.1 — Gán biến môi trường

Mở **Git Bash** (Windows) hoặc **WSL** terminal. Copy-paste block dưới đây rồi điền giá trị thực tế từ Dashboard:

```bash
export BACKEND="http://localhost:5000"
export GW_ID="ESP32-GW-XXXXXXXX"      # device_id Gateway — lấy từ Devices page
export GW_SECRET="aabbcc...64chars"   # secret_key Gateway — chỉ hiện 1 lần khi tạo
export SN_ID="ESP32-SN-XXXXXXXX"      # device_id Sensor
export SN_SECRET="112233...64chars"   # secret_key Sensor
```

**Xác nhận HMAC hoạt động (bắt buộc):**
```bash
TEST_TS=$(date +%s)
HMAC_OUT=$(echo -n "${GW_ID}:${TEST_TS}" | openssl dgst -sha256 -hmac "$GW_SECRET" -hex | sed 's/^.* //')
echo "Kết quả: $HMAC_OUT"
echo "Độ dài : ${#HMAC_OUT} ký tự (phải đúng bằng 64)"
```
- Ra 64 ký tự hex → OK, tiếp tục.
- Ra chuỗi rỗng hoặc khác 64 ký tự → kiểm tra lại GW_SECRET (phải là chuỗi hex 64 ký tự, không có space, không có newline).

---

### 3.2 — Bước 1: Chạy attack_demo.sh (S0–S4)

```bash
cd /e/WorkSpace/managerDeviceIoT    # Git Bash Windows
# hoặc: cd /mnt/e/WorkSpace/managerDeviceIoT  # WSL

chmod +x scripts/attack_demo.sh
./scripts/attack_demo.sh "$BACKEND" "$GW_ID" "$GW_SECRET" "$SN_ID" "$SN_SECRET"
```

Script tự động chạy tuần tự S0 → S4. Theo dõi terminal và Dashboard song song:

---

**S0 — Baseline (kỳ vọng: 200 OK)**

Terminal in:
```
══════════════════════════════════════════════════
  SCENARIO 0: Baseline – Request hợp lệ (kỳ vọng: 200 OK)
══════════════════════════════════════════════════
  ℹ Xác nhận hệ thống hoạt động bình thường — điểm đối chiếu cho các tấn công
Payload:
{ "gateway_id": "ESP32-GW-...", ... }

→ Gửi request hợp lệ...
✓ HTTP 200
  Response: {"success":true,"sensor_id":"ESP32-SN-...","received_at":"..."}

  ✓ DATA_RECV ghi vào audit_log
```

Kiểm tra Dashboard sau S0:
- **Audit** (`/audit`): có sự kiện `DATA_RECV` badge xanh
- **Devices**: cả Gateway và Sensor vừa cập nhật `last_seen`

Nếu ra 401 ở S0 → Dừng lại: kiểm tra GW_SECRET/SN_SECRET hoặc status thiết bị chưa active.

---

**S1 — Device Spoofing: HMAC giả mạo Layer 1 (kỳ vọng: 401)**

Terminal in:
```
══════════════════════════════════════════════════
  SCENARIO 1: Device Spoofing – HMAC giả mạo (kỳ vọng: 401 GATEWAY_AUTH_FAIL)
══════════════════════════════════════════════════
  ℹ Kẻ tấn công biết gateway_id nhưng không có secret_key → tự bịa HMAC 64 hex
  ℹ Bảo vệ: HMAC-SHA256 + timingSafeEqual() — không thể giả mạo nếu không có key
Payload (gw_hmac = deadbeef... — bịa đặt):
{ ..., "gw_hmac": "deadbeefdeadbeef..." }

→ Gửi request với HMAC giả mạo...
✗ HTTP 401
  Response: {"error":"GATEWAY_AUTH_FAIL","reason":"HMAC_MISMATCH"}

  ✓ timingSafeEqual(expected, 'deadbeef...') = false → 401 GATEWAY_AUTH_FAIL + HMAC_MISMATCH
```

Kiểm tra Dashboard sau S1:
- **Audit**: thấy `GATEWAY_AUTH_FAIL` với `reason: HMAC_MISMATCH`
- **Devices**: `fail_count` của Gateway tăng lên 1

---

**S2 — Replay Attack: Timestamp cũ −700s (kỳ vọng: 401 REPLAY_ATTACK)**

Terminal in:
```
══════════════════════════════════════════════════
  SCENARIO 2: Replay Attack – Timestamp cũ 12 phút (kỳ vọng: 401 REPLAY_ATTACK)
══════════════════════════════════════════════════
  ℹ Kẻ tấn công chặn request hợp lệ và gửi lại sau 12 phút — HMAC đúng kỹ thuật
  ℹ Bảo vệ: |now() − timestamp| ≤ 300s — mỗi request chỉ hợp lệ trong ±5 phút
Payload (timestamp = 17XXXXXXX, cách đây 700s — HMAC đúng):
{ ..., "gw_timestamp": 17XXXXXXX, "gw_hmac": "<hmac đúng kỹ thuật>" }

→ Gửi request với timestamp cũ...
✗ HTTP 401
  Response: {"error":"GATEWAY_AUTH_FAIL","reason":"TIMESTAMP_EXPIRED"}

  ✓ HMAC đúng nhưng |now − 17XXXXXXX| > 300s → TIMESTAMP_EXPIRED → audit: REPLAY_ATTACK
```

Kiểm tra Dashboard sau S2:
- **Audit**: thấy `REPLAY_ATTACK` với `reason: TIMESTAMP_EXPIRED`
- Chú ý: HMAC trong payload S2 là **hoàn toàn đúng** về kỹ thuật — chỉ bị từ chối vì timestamp quá cũ

---

**S3 — Brute Force → Auto Block (kỳ vọng: DEVICE_BLOCKED)**

Terminal in 6 dòng liên tiếp:
```
══════════════════════════════════════════════════
  SCENARIO 3: Brute Force → Auto Block (kỳ vọng: 401×5 rồi 403 DEVICE_BLOCKED)
══════════════════════════════════════════════════
  ℹ Kẻ tấn công gửi HMAC ngẫu nhiên liên tiếp — bị block sau 5 lần
  ℹ Bảo vệ: fail_count tăng mỗi lần fail, đạt BLOCK_THRESHOLD=5 → status='blocked'
  Lần 1: HTTP 401 | {"error":"GATEWAY_AUTH_FAIL","reason":"HMAC_MISMATCH"}
  Lần 2: HTTP 401 | {"error":"GATEWAY_AUTH_FAIL","reason":"HMAC_MISMATCH"}
  Lần 3: HTTP 401 | {"error":"GATEWAY_AUTH_FAIL","reason":"HMAC_MISMATCH"}
  Lần 4: HTTP 401 | {"error":"GATEWAY_AUTH_FAIL","reason":"HMAC_MISMATCH"}
  Lần 5: HTTP 401 | {"error":"GATEWAY_AUTH_FAIL","reason":"HMAC_MISMATCH"}
  Lần 6: HTTP 401 | {"error":"GATEWAY_AUTH_FAIL","reason":"HMAC_MISMATCH"}

  ✓ Lần 5: fail_count ≥ 5 → blockDevice() → DEVICE_BLOCKED ghi audit
  ℹ Gateway ESP32-GW-... hiện status='blocked' — chạy attack_demo_extended.sh để demo tiếp
```

> **Tại sao lần 6 vẫn ra 401 (không phải 403)?** Lần 6 dùng HMAC ngẫu nhiên vẫn sai → fail ở Layer 1 HMAC trước khi đến status check. Demo "HMAC đúng + device blocked → 403" sẽ được thực hiện ở Scenario 7.

> **Fail_count thực tế:** S1 và S2 đã tăng fail_count lên 2. Nên thiết bị có thể bị block ngay từ lần 3 của S3 (tổng fail_count = 5). Cơ chế BLOCK_THRESHOLD = 5 vẫn đúng.

Kiểm tra Dashboard ngay sau S3:
- **Audit**: thấy nhiều `GATEWAY_AUTH_FAIL` + 1 event `DEVICE_BLOCKED`
- **Devices**: Gateway hiển thị badge đỏ **Blocked** — trạng thái đã thay đổi

⚠️ **KHÔNG reset Gateway lúc này** — Scenario 7 trong script extended cần Gateway đang blocked.

---

**S4 — Privilege Escalation: Sensor giả làm Gateway (kỳ vọng: 403)**

Terminal in:
```
══════════════════════════════════════════════════
  SCENARIO 4: Privilege Escalation – Sensor giả làm Gateway (kỳ vọng: 403 PRIVILEGE_ESCALATION)
══════════════════════════════════════════════════
  ℹ Sensor có secret_key hợp lệ → HMAC đúng kỹ thuật, nhưng device_type='sensor' ≠ 'gateway'
  ℹ Bảo vệ: RBAC device_type check trong data.routes.ts sau khi cả 2 HMAC đã pass
Payload (gateway_id = SN_ID = ESP32-SN-... | gw_hmac tính từ SN_SECRET — đúng kỹ thuật):
{ "gateway_id": "ESP32-SN-...", "gw_hmac": "<hmac đúng>" }

→ Gửi request privilege escalation...
✗ HTTP 403
  Response: {"error":"INVALID_DEVICE_TYPE","detail":"gateway_id must be a gateway device"}

  ✓ HMAC Layer1+Layer2: PASS | RBAC: device_type='sensor' ≠ 'gateway' → 403 PRIVILEGE_ESCALATION
```

Kiểm tra Dashboard sau S4:
- **Audit**: thấy `PRIVILEGE_ESCALATION`
- **Lưu ý khi thuyết trình:** HTTP 403 (có danh tính, sai quyền) khác với 401 (chưa xác thực). HMAC pass nhưng device_type RBAC fail.

Terminal in tổng kết script core:
```
══════════════════════════════════════════════════
  TỔNG KẾT – CORE 5 SCENARIOS
══════════════════════════════════════════════════
  S0  Baseline (hợp lệ)           → 200 DATA_RECV
  S1  Device Spoofing (HMAC fake) → 401 GATEWAY_AUTH_FAIL (HMAC_MISMATCH)
  S2  Replay Attack (−700s)        → 401 REPLAY_ATTACK (TIMESTAMP_EXPIRED)
  S3  Brute Force → Auto Block     → 401×5 GATEWAY_AUTH_FAIL + DEVICE_BLOCKED
  S4  Privilege Escalation (type)  → 403 PRIVILEGE_ESCALATION
```

---

### 3.3 — Bước 2: Chạy attack_demo_extended.sh (S5–S10)

Chạy **ngay sau khi script core kết thúc**, không làm gì khác:

```bash
chmod +x scripts/attack_demo_extended.sh
./scripts/attack_demo_extended.sh \
    "$BACKEND" \
    "$GW_ID" "$GW_SECRET" \
    "$SN_ID" "$SN_SECRET" \
    "admin" "admin123"
```

---

**S5 — Sensor HMAC fake: Layer 2 fail (kỳ vọng: 401 SENSOR_AUTH_FAIL)**

Terminal in:
```
══════════════════════════════════════════════════
  SCENARIO 5: Sensor HMAC fake – Layer 2 fail (kỳ vọng: 401 SENSOR_AUTH_FAIL)
══════════════════════════════════════════════════
  ℹ Gateway HMAC đúng, nhưng sn_hmac bịa đặt → Layer 2 (Sensor) bị từ chối
  ℹ Bảo vệ: xác thực 2 lớp độc lập — cả 2 HMAC phải đúng trước khi ghi data
Payload (gw_hmac đúng | sn_hmac = 'aaa...' — bịa đặt):
{ ..., "gw_hmac": "<đúng>", "sn_hmac": "aaaa..." }

→ Gửi request Layer 2 attack...
✗ HTTP 401
  Response: {"error":"SENSOR_AUTH_FAIL","reason":"HMAC_MISMATCH"}

  ✓ gw_hmac PASS → sn_hmac FAIL → 401 SENSOR_AUTH_FAIL → audit: SENSOR_AUTH_FAIL
```

Kiểm tra Dashboard:
- **Audit**: `SENSOR_AUTH_FAIL` — chứng minh Layer 2 kiểm tra độc lập với Layer 1

---

**S6 — Replay Attack: Timestamp tương lai +700s (kỳ vọng: 401 REPLAY_ATTACK)**

Terminal in:
```
══════════════════════════════════════════════════
  SCENARIO 6: Replay Attack – Timestamp tương lai +12 phút (kỳ vọng: 401 REPLAY_ATTACK)
══════════════════════════════════════════════════
  ℹ Kẻ tấn công pre-sign một request để dùng sau — HMAC đúng nhưng timestamp là tương lai
  ℹ Bảo vệ: cùng cơ chế với timestamp cũ — |now() − ts| ≤ 300s; cả 2 chiều đều bị từ chối
Payload (timestamp = 17XXXXXXX, cách đây +700s — HMAC đúng):
{ "gw_timestamp": 17XXXXXXX, "gw_hmac": "<hmac đúng cho ts tương lai>" }

→ Gửi request với timestamp tương lai...
✗ HTTP 401
  Response: {"error":"GATEWAY_AUTH_FAIL","reason":"TIMESTAMP_EXPIRED"}

  ✓ HMAC đúng nhưng ts − now > 300s → TIMESTAMP_EXPIRED → audit: REPLAY_ATTACK
```

Kiểm tra Dashboard:
- **Audit**: thêm 1 `REPLAY_ATTACK` — cùng cơ chế với S2 nhưng chiều tương lai

---

**S7 — Blocked Device: HMAC đúng nhưng bị block (kỳ vọng: 403 DEVICE_BLOCKED)**

Đây là scenario cần Gateway vẫn đang blocked từ S3. Terminal in:
```
══════════════════════════════════════════════════
  SCENARIO 7: Blocked Device – HMAC hợp lệ nhưng status='blocked' (kỳ vọng: 403 DEVICE_BLOCKED)
══════════════════════════════════════════════════
  ℹ Sau Scenario 3 (brute force), Gateway bị block. Bây giờ thử gửi request HMAC đúng.
  ℹ Kiểm tra thứ tự: status check xảy ra SAU khi 2 lớp HMAC đã pass
Payload (HMAC hoàn toàn đúng, nhưng device status='blocked'):
{ "gateway_id": "ESP32-GW-...", "gw_hmac": "<hmac đúng>" }

→ Gửi request với HMAC đúng từ device bị block...
✗ HTTP 403
  Response: {"error":"DEVICE_BLOCKED","detail":"Gateway is blocked"}

  ✓ HMAC PASS → status check: 'blocked' → 403 DEVICE_BLOCKED (fail_count KHÔNG tăng thêm)
```

Nếu ra 200 thay vì 403: Gateway đã được reset (ai đó unlock trước đó). S7 vẫn có thể chạy lại bằng cách dùng brute force thêm lần nữa.

Kiểm tra Dashboard:
- **Devices**: xác nhận Gateway vẫn badge đỏ `Blocked`
- **Điểm quan trọng khi thuyết trình:** kể cả có secret_key thật (flash dump ESP32), thiết bị blocked vẫn không gửi được data

---

**S8 — Unregistered Device (kỳ vọng: 401 NOT_FOUND)**

Terminal in:
```
══════════════════════════════════════════════════
  SCENARIO 8: Unregistered Device – gateway_id không tồn tại (kỳ vọng: 401)
══════════════════════════════════════════════════
  ℹ Kẻ tấn công dùng device ID tự tạo — không có trong database, không thể lookup secret_key
  ℹ Bảo vệ: lookup secret_key thất bại → không thể tính expected HMAC → 401
Payload (gateway_id = ESP32-GW-NOTEXIST — không tồn tại trong DB):
{ "gateway_id": "ESP32-GW-NOTEXIST", ... }

→ Gửi request từ device không đăng ký...
✗ HTTP 401
  Response: {"error":"GATEWAY_AUTH_FAIL","reason":"NOT_FOUND"}

  ✓ Device lookup failed → secret_key không tìm được → 401 GATEWAY_AUTH_FAIL (NOT_FOUND)
```

Kiểm tra Dashboard:
- **Audit**: `GATEWAY_AUTH_FAIL` với `reason: NOT_FOUND, gateway_id: ESP32-GW-NOTEXIST`

---

**S9 — Inactive Device qua Admin API (kỳ vọng: 403 DEVICE_NOT_ACTIVE)**

Script thực hiện 4 bước tự động. Terminal in từng bước:
```
══════════════════════════════════════════════════
  SCENARIO 9: Inactive Device – deactivate qua API rồi thử gửi data (kỳ vọng: 403 DEVICE_NOT_ACTIVE)
══════════════════════════════════════════════════
  Bước 1: Login admin...           [script gọi POST /api/auth/login]
  Tìm device_id của ESP32-GW-...
  device.id = 3
  Bước 2: Deactivate device ESP32-GW-...
  PATCH status → HTTP 200          [admin đặt status='inactive']
  Bước 3: Gửi data từ device inactive (HMAC đúng)...
✗ HTTP 403
  Response: {"error":"DEVICE_NOT_ACTIVE","detail":"Gateway is not active"}

  ✓ HMAC PASS → status check: 'inactive' → 403 DEVICE_NOT_ACTIVE
  Bước 4 (cleanup): Reactivate device ESP32-GW-...
  PATCH status='active' → HTTP 200 [admin khôi phục lại]
  ✓ Device ESP32-GW-... đã được khôi phục về trạng thái active
```

Nếu script in `Login admin thất bại — kiểm tra ADMIN_USER/ADMIN_PASS`:
- Tham số thứ 6 và 7 sai → chạy lại với đúng username/password
- Thử kiểm tra: `curl -s -X POST http://localhost:5000/api/auth/login -H "Content-Type: application/json" -d '{"username":"admin","password":"admin123"}'`

Sau S9: Gateway tự động được khôi phục `active`. Tuy nhiên Gateway vẫn có thể bị `blocked` từ S3 (S9 chỉ patch status, không reset fail_count).

---

**S10 — RBAC REST API Violation (kỳ vọng: 403 FORBIDDEN)**

Script tạo viewer tạm, test 3 case, rồi tự cleanup. Terminal in:
```
══════════════════════════════════════════════════
  SCENARIO 10: RBAC REST API – Viewer cố xóa audit log (kỳ vọng: 403 FORBIDDEN)
══════════════════════════════════════════════════
  Tạo tài khoản viewer tạm thời...
  Tạo viewer 'demo_viewer_1750000000' → HTTP 201
  Test 1: Viewer login...
  Test 2: Viewer gọi GET /api/audit-log (được phép)...
  ✓ GET /api/audit-log → HTTP 200 (viewer có quyền đọc)
  Test 3: Viewer gọi DELETE /api/audit-log/data-recv (bị cấm)...
  ✓ DELETE /api/audit-log/data-recv → HTTP 403 FORBIDDEN (chỉ admin được xóa)
  Test 4: Viewer gọi GET /api/users (admin only)...
  ✓ GET /api/users → HTTP 403 FORBIDDEN (RBAC admin-only)
  Cleanup: Xóa tài khoản viewer tạm 'demo_viewer_1750000000'...
  DELETE user/5 → HTTP 200
  ✓ Viewer tạm đã được xóa
```

Terminal in tổng kết script extended:
```
══════════════════════════════════════════════════
  TỔNG KẾT – EXTENDED 6 SCENARIOS
══════════════════════════════════════════════════
  S5  Sensor HMAC fake (Layer 2)  → 401 SENSOR_AUTH_FAIL
  S6  Replay Attack (+700s future) → 401 REPLAY_ATTACK (TIMESTAMP_EXPIRED)
  S7  Blocked device valid HMAC    → 403 DEVICE_BLOCKED
  S8  Unregistered device          → 401 GATEWAY_AUTH_FAIL (NOT_FOUND)
  S9  Inactive device (API demo)   → 403 DEVICE_NOT_ACTIVE
  S10 RBAC REST API violation      → 403 FORBIDDEN
```

---

### 3.4 — Kiểm tra kết quả tổng thể

**Dashboard Audit** (`http://localhost:3000/audit`) — phải thấy đủ 7 loại event:

| Event Type | Từ Scenario | Ghi chú |
|---|---|---|
| `DATA_RECV` | S0 | Badge xanh |
| `GATEWAY_AUTH_FAIL` (HMAC_MISMATCH) | S1, S3 | Badge đỏ |
| `REPLAY_ATTACK` (TIMESTAMP_EXPIRED) | S2, S6 | Badge cam |
| `DEVICE_BLOCKED` | S3 | Badge đỏ đậm |
| `PRIVILEGE_ESCALATION` | S4 | Badge tím |
| `SENSOR_AUTH_FAIL` (HMAC_MISMATCH) | S5 | Badge cam |
| `GATEWAY_AUTH_FAIL` (NOT_FOUND) | S8 | Badge đỏ |

**Kiểm tra DB trực tiếp:**
```powershell
docker exec -it iot-mysql mysql -u iot_managerIoT -piot_managerIoTpassword iot_managerDeviceIoT
```
```sql
-- Thống kê số lần mỗi loại event
SELECT event_type, COUNT(*) AS so_lan
FROM audit_log
GROUP BY event_type
ORDER BY so_lan DESC;

-- Trạng thái thiết bị sau demo
SELECT device_id, device_type, status, fail_count
FROM devices;
-- Gateway: status='blocked', fail_count >= 5
-- Sensor : status='active',  fail_count = 0 (hoặc thấp)
```

---

### 3.5 — Reset sau khi demo

Sau khi cả 2 script chạy xong, Gateway vẫn bị `blocked`. Reset để chạy lại:

**Cách 1 — Qua Dashboard (khuyên dùng):**
1. Vào `http://localhost:3000/devices`
2. Tìm Gateway có badge đỏ `Blocked`
3. Click vào → đổi Status về `active` → lưu
4. Xác nhận badge chuyển xanh

**Cách 2 — SQL (nhanh hơn):**
```powershell
docker exec -it iot-mysql mysql -u iot_managerIoT -piot_managerIoTpassword iot_managerDeviceIoT -e "UPDATE devices SET status='active', fail_count=0 WHERE device_type='gateway';"
```

Sau khi reset, có thể chạy lại toàn bộ 11 scenario từ đầu bất kỳ lúc nào.

---

## 4. Scenario 0 — Baseline: Request hợp lệ

### Mục đích
Chứng minh hệ thống hoạt động bình thường với request đầy đủ và đúng. Dùng làm điểm đối chiếu cho các scenario tấn công sau.

### Điều kiện để request hợp lệ (4 điều kiện đồng thời)
```
1. gateway_id tồn tại trong DB với status = 'active'
2. |now() - gw_timestamp| ≤ 300 giây
3. HMAC-SHA256(gw_secret, "gateway_id:gw_timestamp") == gw_hmac
4. Tương tự cho sensor_id / sn_timestamp / sn_hmac
```

### Luồng code khi request hợp lệ

```
POST /api/iot/data
  │
  ├─ validateDevice middleware (validateDevice.ts)
  │     ├─ verifyGatewayHMAC() → ok: true
  │     └─ verifyDeviceHMAC()  → ok: true
  │
  └─ data.routes.ts handler
        ├─ RBAC: gwRow.device_type == 'gateway' ✓
        ├─ RBAC: snRow.device_type == 'sensor'  ✓
        ├─ Status: gwRow.status == 'active'      ✓
        ├─ Status: snRow.status == 'active'      ✓
        ├─ INSERT sensor_data (device_id, gateway_id, payload)
        ├─ UPDATE devices SET last_seen=NOW(), fail_count=0
        ├─ INSERT audit_log (event_type='DATA_RECV')
        └─ return 200 {success: true, received_at: ...}
```

### Lệnh thực hiện

```bash
GW_TS=$(ts); SN_TS=$(ts)
GW_HMAC=$(hmac "$GW_SECRET" "${GW_ID}:${GW_TS}")
SN_HMAC=$(hmac "$SN_SECRET" "${SN_ID}:${SN_TS}")

echo "=== Payload hợp lệ ==="
echo "GW timestamp : $GW_TS"
echo "SN timestamp : $SN_TS"
echo "GW HMAC      : $GW_HMAC"
echo "SN HMAC      : $SN_HMAC"
echo ""

post_data "{
  \"gateway_id\":   \"$GW_ID\",
  \"gw_timestamp\": $GW_TS,
  \"gw_hmac\":      \"$GW_HMAC\",
  \"sensor_id\":    \"$SN_ID\",
  \"sn_timestamp\": $SN_TS,
  \"sn_hmac\":      \"$SN_HMAC\",
  \"data\":         { \"temperature\": 27.5, \"humidity\": 65.0 }
}"
```

### Kết quả mong đợi

```
HTTP 200
{
    "success": true,
    "sensor_id": "ESP32-SN-XXXXXXXX",
    "gateway_id": "ESP32-GW-XXXXXXXX",
    "received_at": "2026-06-08T10:30:00.000Z"
}
```

### Kiểm tra trên Dashboard
- **Devices**: cả Gateway và Sensor chuyển sang `Online` (chấm xanh nhấp nháy)
- **Audit Log**: có sự kiện `DATA_RECV` màu xanh

### Kiểm tra trong DB
```sql
-- Xem bản ghi dữ liệu vừa được lưu
SELECT d.device_id AS sensor, gw.device_id AS gateway,
       sd.payload, sd.received_at
FROM sensor_data sd
JOIN devices d  ON sd.device_id  = d.id
JOIN devices gw ON sd.gateway_id = gw.id
ORDER BY sd.received_at DESC LIMIT 3;
```

---

## 5. Scenario 1 — Gateway HMAC giả mạo (Layer 1)

### Mô tả tấn công
Kẻ tấn công **biết `device_id`** (có thể sniff từ MQTT broker, log công khai, hoặc reverse engineering firmware) nhưng **không có `secret_key`**. Hắn tự tạo một chuỗi hex 64 ký tự giả để gửi vào trường `gw_hmac`.

```
Kẻ tấn công có:  gateway_id = "ESP32-GW-A1B2C3D4"  ✓ (biết)
Kẻ tấn công thiếu: secret_key                        ✗ (không biết)
Kẻ tấn công làm:  gw_hmac = "deadbeef...64 chars"   ← bịa đặt
```

### Tại sao tấn công thất bại — giải thích từng dòng code

**Bước 1 — Server tính lại HMAC để so sánh** (`hmacService.ts:56`):
```typescript
// Server lấy secret_key từ DB (kẻ tấn công không có key này)
const expected = computeHMAC(device.secret_key, `${gateway_id}:${gw_timestamp}`)
    .toString("hex");
// expected = "7f3a9b2c..." (64 hex chars — hoàn toàn khác với giá trị giả)
```

**Bước 2 — So sánh timing-safe** (`hmacService.ts:29-38`):
```typescript
function safeCompare(a: string, b: string): boolean {
    const bufA = Buffer.from(a, "hex");  // expected (tính từ DB)
    const bufB = Buffer.from(b, "hex");  // từ request (deadbeef...)
    if (bufA.length !== bufB.length) return false;
    return crypto.timingSafeEqual(bufA, bufB);  // LUÔN so sánh đủ 32 bytes
    // → false vì "deadbeef..." ≠ "7f3a9b2c..."
}
```

> **Tại sao dùng `timingSafeEqual` thay vì `===`?**
> So sánh `===` dừng lại ngay ký tự đầu tiên khác nhau — kẻ tấn công có thể đo thời gian phản hồi để đoán ra bao nhiêu ký tự đầu đúng (timing attack). `timingSafeEqual` luôn tốn đúng cùng một thời gian dù kết quả đúng hay sai.

**Bước 3 — Ghi audit và tăng fail_count** (`validateDevice.ts:56-70`):
```typescript
await log("GATEWAY_AUTH_FAIL", deviceDbId, ip, userAgent, {
    gateway_id, reason: "HMAC_MISMATCH"
});
const newCount = await incrementFailCount(deviceDbId);
if (newCount >= 5) {
    await blockDevice(deviceDbId);  // → status = 'blocked'
}
res.status(401).json({ error: "GATEWAY_AUTH_FAIL", reason: "HMAC_MISMATCH" });
```

### Lệnh thực hiện

```bash
echo "=== SCENARIO 1: Device Spoofing ==="
echo "Kẻ tấn công biết GW_ID nhưng không có secret_key"
echo "Tự tạo HMAC giả: deadbeef...64chars"
echo ""

GW_TS=$(ts); SN_TS=$(ts)

post_data "{
  \"gateway_id\":   \"$GW_ID\",
  \"gw_timestamp\": $GW_TS,
  \"gw_hmac\":      \"deadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeef\",
  \"sensor_id\":    \"$SN_ID\",
  \"sn_timestamp\": $SN_TS,
  \"sn_hmac\":      \"cafebabecafebabecafebabecafebabecafebabecafebabecafebabecafebabe00\",
  \"data\":         { \"temperature\": 99.9, \"humidity\": 0.0 }
}"
```

### Kết quả mong đợi

```
HTTP 401
{
    "error": "GATEWAY_AUTH_FAIL",
    "reason": "HMAC_MISMATCH"
}
```

### Minh họa tại sao HMAC không thể giả mạo

```
Kẻ tấn công gửi:
  gw_hmac = "deadbeefdeadbeef..." (64 chars — bịa)

Server tính:
  message  = "ESP32-GW-XXXXXXXX:1749383000"
  expected = HMAC-SHA256("aabbcc...secret", message)
           = "7f3a9b2c4e8d1f6a..." (64 chars — hoàn toàn khác)

timingSafeEqual("deadbeef...", "7f3a9b2c...") → FALSE
→ 401 GATEWAY_AUTH_FAIL
```

**Tại sao không thể đoán ra HMAC?**
- SHA-256 tạo ra 2^256 ≈ 10^77 giá trị có thể
- Brute force toàn bộ: cần 10^77 lần thử × tốc độ máy tính nhanh nhất hiện nay → **hàng tỷ tỷ năm**
- Mỗi lần sai → fail_count tăng → bị block sau 5 lần

### Kiểm tra sau tấn công

```sql
-- Xem fail_count tăng
SELECT device_id, fail_count, status FROM devices WHERE device_id = 'ESP32-GW-XXXXXXXX';

-- Xem audit log
SELECT event_type, details, created_at FROM audit_log
WHERE event_type = 'GATEWAY_AUTH_FAIL'
ORDER BY created_at DESC LIMIT 5;
```

---

## 6. Scenario 2 — Sensor HMAC giả mạo (Layer 2)

### Mô tả tấn công
Gateway HMAC **đúng** (pass Layer 1), nhưng Sensor HMAC **sai**. Chứng minh hai lớp xác thực HMAC hoạt động độc lập: qua Layer 1 không đồng nghĩa qua được Layer 2.

### Luồng code
```
validateDevice:
  Layer 1: verifyGatewayHMAC(gw_id, gw_ts, gw_hmac_real) → ok: true ✓
  Layer 2: verifyDeviceHMAC(sn_id, sn_ts, "badc0ffee...") → ok: false ✗
    → snEventType = "SENSOR_AUTH_FAIL"
    → log("SENSOR_AUTH_FAIL", sensor_db_id, ip, ua, {sensor_id, reason: "HMAC_MISMATCH"})
    → incrementFailCount(sensor)
    → 401 { error: "SENSOR_AUTH_FAIL", reason: "HMAC_MISMATCH" }
```

### Lệnh thực hiện
```bash
echo "=== SCENARIO 2: Sensor HMAC fail (Layer 2) ==="
GW_TS=$(ts); SN_TS=$(ts)
GW_HMAC_REAL=$(hmac "$GW_SECRET" "${GW_ID}:${GW_TS}")

post_data "{
  \"gateway_id\":   \"$GW_ID\",
  \"gw_timestamp\": $GW_TS,
  \"gw_hmac\":      \"$GW_HMAC_REAL\",
  \"sensor_payload\": {
    \"sensor_id\":    \"$SN_ID\",
    \"sn_timestamp\": $SN_TS,
    \"sn_hmac\":      \"badc0ffeebadc0ffeebadc0ffeebadc0ffeebadc0ffeebadc0ffeebadc0ffee0\",
    \"data\":         { \"temperature\": 0.0, \"humidity\": 0.0 }
  }
}"
```

### Kết quả mong đợi
```json
HTTP 401
{ "error": "SENSOR_AUTH_FAIL", "reason": "HMAC_MISMATCH" }
```

---

## 7. Scenario 3 — Replay Attack: Timestamp cũ

### Mô tả tấn công
Kẻ tấn công **chặn được 1 request hợp lệ hoàn toàn** (ví dụ sniff traffic, MITM) và cố gửi lại sau 10 phút để đưa dữ liệu giả vào hệ thống. HMAC trong request này **hoàn toàn đúng** — chỉ có timestamp là cũ.

```
Request gốc (hợp lệ lúc 10:00):
  gw_timestamp = 1749380400
  gw_hmac      = "a1b2c3d4..." (đúng, tính từ secret thật)

Kẻ tấn công gửi lại lúc 10:12 (12 phút sau):
  gw_timestamp = 1749380400  ← timestamp cũ 12 phút
  gw_hmac      = "a1b2c3d4..." ← HMAC vẫn đúng!
```

### Tại sao tấn công thất bại — cơ chế timestamp window

**Kiểm tra trong `hmacService.ts:21-23`:**
```typescript
const TIMESTAMP_WINDOW_SECONDS = 300;  // ±5 phút

function isTimestampValid(timestamp: number): boolean {
    return Math.abs(Date.now() / 1000 - timestamp) <= TIMESTAMP_WINDOW_SECONDS;
    //  |now()  -  timestamp| ≤ 300 giây
    //  |10:12  -  10:00   | = 720 giây > 300 giây → FALSE
}
```

**Thứ tự kiểm tra** (timestamp được kiểm tra **TRƯỚC** HMAC):
```
verifyGatewayHMAC()
  1. fetchDevice(gateway_id)         → tìm thấy ✓
  2. isTimestampValid(gw_timestamp)  → |720| > 300 → FALSE → return TIMESTAMP_EXPIRED
  3. computeHMAC()                   → KHÔNG CHẠY (đã thoát ở bước 2)
```

> **Điểm quan trọng khi thuyết trình:** HMAC trong Scenario 2 là **100% hợp lệ** — key đúng, message đúng. Nhưng vẫn bị từ chối vì timestamp cũ. Đây là lớp bảo vệ độc lập với HMAC.

### Lệnh thực hiện

```bash
echo "=== SCENARIO 2: Replay Attack ==="
echo "Giả lập: chặn request lúc 10:00 và gửi lại lúc 10:12"
echo ""

# Tạo timestamp CŨ 700 giây (≈12 phút)
OLD_TS=$(($(ts) - 700))
echo "Timestamp cũ: $OLD_TS ($(date -d @$OLD_TS 2>/dev/null || date -r $OLD_TS) — 12 phút trước)"
echo "Timestamp hiện tại: $(ts)"
echo "Chênh lệch: $(($(ts) - OLD_TS)) giây > 300 giây → sẽ bị từ chối"
echo ""

# HMAC tính đúng từ secret — nhưng với timestamp cũ
GW_HMAC_OLD=$(hmac "$GW_SECRET" "${GW_ID}:${OLD_TS}")
SN_HMAC_OLD=$(hmac "$SN_SECRET" "${SN_ID}:${OLD_TS}")

echo "HMAC gateway (đúng kỹ thuật): $GW_HMAC_OLD"
echo "HMAC sensor  (đúng kỹ thuật): $SN_HMAC_OLD"
echo ""

post_data "{
  \"gateway_id\":   \"$GW_ID\",
  \"gw_timestamp\": $OLD_TS,
  \"gw_hmac\":      \"$GW_HMAC_OLD\",
  \"sensor_id\":    \"$SN_ID\",
  \"sn_timestamp\": $OLD_TS,
  \"sn_hmac\":      \"$SN_HMAC_OLD\",
  \"data\":         { \"temperature\": 25.0, \"humidity\": 60.0 }
}"
```

### Kết quả mong đợi

```
HTTP 401
{
    "error": "GATEWAY_AUTH_FAIL",
    "reason": "TIMESTAMP_EXPIRED"
}
```

### Minh họa timeline tấn công

```
10:00:00  Sensor gửi request hợp lệ → timestamp = T
10:00:00  Kẻ tấn công chặn request này (sniff, MITM)
10:04:59  Cửa sổ 300 giây vẫn còn hiệu lực → request vẫn có thể gửi lại được
10:05:01  Cửa sổ 300 giây ĐÃ ĐÓNG → timestamp T cũ > 300s → mọi replay đều fail
10:12:00  Kẻ tấn công gửi lại → timestamp T (700s cũ) → TIMESTAMP_EXPIRED → 401
```

**Mỗi request chỉ hợp lệ trong 5 phút.** Sau đó, kể cả có HMAC đúng hoàn toàn, request cũng vô dụng.

### Bonus — Thử với timestamp CẬN BIÊN (289 giây cũ — vẫn còn hợp lệ)

```bash
echo "=== Thử timestamp 289 giây cũ (trong cửa sổ 300s) ==="
NEAR_TS=$(($(ts) - 289))
NEAR_GW_HMAC=$(hmac "$GW_SECRET" "${GW_ID}:${NEAR_TS}")
NEAR_SN_HMAC=$(hmac "$SN_SECRET" "${SN_ID}:${NEAR_TS}")

post_data "{
  \"gateway_id\":   \"$GW_ID\",
  \"gw_timestamp\": $NEAR_TS,
  \"gw_hmac\":      \"$NEAR_GW_HMAC\",
  \"sensor_id\":    \"$SN_ID\",
  \"sn_timestamp\": $NEAR_TS,
  \"sn_hmac\":      \"$NEAR_SN_HMAC\",
  \"data\":         { \"temperature\": 26.0, \"humidity\": 62.0 }
}"
# Kết quả: 200 OK (vẫn trong cửa sổ 5 phút)
```

---

## 8. Scenario 4 — Replay Attack: Timestamp tương lai

### Mô tả tấn công
Kẻ tấn công pre-sign request với timestamp **trong tương lai** (+700s). Cùng cơ chế `isTimestampValid()` nhưng theo hướng ngược lại. Chứng minh cửa sổ ±300s hoạt động cả hai chiều.

### Lệnh thực hiện
```bash
echo "=== SCENARIO 4: Replay — timestamp tương lai ==="
FUTURE_TS=$(($(ts) + 700))
GW_HMAC_FUT=$(hmac "$GW_SECRET" "${GW_ID}:${FUTURE_TS}")
SN_HMAC_FUT=$(hmac "$SN_SECRET" "${SN_ID}:${FUTURE_TS}")

post_data "{
  \"gateway_id\":   \"$GW_ID\",
  \"gw_timestamp\": $FUTURE_TS,
  \"gw_hmac\":      \"$GW_HMAC_FUT\",
  \"sensor_payload\": {
    \"sensor_id\":    \"$SN_ID\",
    \"sn_timestamp\": $FUTURE_TS,
    \"sn_hmac\":      \"$SN_HMAC_FUT\",
    \"data\":         { \"temperature\": 25.0, \"humidity\": 60.0 }
  }
}"
```

### Kết quả mong đợi
```json
HTTP 401
{ "error": "GATEWAY_AUTH_FAIL", "reason": "TIMESTAMP_EXPIRED" }
```

> **Điểm quan trọng:** `|now() - future_ts|` = 700s > 300s → `TIMESTAMP_EXPIRED`. Cùng error code với timestamp cũ. Audit log ghi `REPLAY_ATTACK`.

---

## 9. Scenario 5 — Brute Force → Auto Block

### Mô tả tấn công
Kẻ tấn công không cần biết HMAC — hắn dùng script gửi liên tiếp với HMAC ngẫu nhiên, hy vọng ngẫu nhiên đúng (xác suất 1/2^256 ≈ 0). Mục đích thực tế hơn: gây rối hệ thống, cố khai thác lỗ hổng brute-force nếu có rate limit yếu.

### Cơ chế phòng thủ — Auto Block sau 5 lần

**Từ `validateDevice.ts:8-25`:**
```typescript
const BLOCK_THRESHOLD = 5;

async function incrementFailCount(deviceDbId: number): Promise<number> {
    await pool.execute(
        `UPDATE devices SET fail_count = fail_count + 1 WHERE id = ?`,
        [deviceDbId]
    );
    const [rows] = await pool.execute<any[]>(
        `SELECT fail_count FROM devices WHERE id = ?`, [deviceDbId]
    );
    return rows[0]?.fail_count ?? 0;
}

async function blockDevice(deviceDbId: number): Promise<void> {
    await pool.execute(
        `UPDATE devices SET status = 'blocked' WHERE id = ?`, [deviceDbId]
    );
}
```

**Quy trình từng lần fail:**
```
Lần 1 fail → fail_count = 1 → 401
Lần 2 fail → fail_count = 2 → 401
Lần 3 fail → fail_count = 3 → 401
Lần 4 fail → fail_count = 4 → 401
Lần 5 fail → fail_count = 5 ≥ BLOCK_THRESHOLD(5)
              → blockDevice() → status = 'blocked'
              → INSERT audit_log(DEVICE_BLOCKED)
              → 401
Lần 6+ → Device đã bị block → verifyGatewayHMAC trả về HMAC_MISMATCH
          (vì fail_count không được reset khi đã blocked)
          Hoặc nếu kiểm tra status trước: 403 DEVICE_BLOCKED
```

### Lệnh thực hiện

```bash
echo "=== SCENARIO 3: Brute Force → Auto Block ==="
echo "Gửi 6 request với HMAC ngẫu nhiên mỗi lần"
echo ""

for i in $(seq 1 6); do
    GW_TS=$(ts); SN_TS=$(ts)
    RAND_GW=$(openssl rand -hex 32)
    RAND_SN=$(openssl rand -hex 32)

    echo -n "Lần $i — HMAC giả: ${RAND_GW:0:16}... → "

    http_code=$(curl -s -o /dev/null -w "%{http_code}" \
        -X POST "$ENDPOINT" \
        -H "Content-Type: application/json" \
        -d "{
          \"gateway_id\":   \"$GW_ID\",
          \"gw_timestamp\": $GW_TS,
          \"gw_hmac\":      \"$RAND_GW\",
          \"sensor_id\":    \"$SN_ID\",
          \"sn_timestamp\": $SN_TS,
          \"sn_hmac\":      \"$RAND_SN\",
          \"data\":         {\"temperature\": 20.0, \"humidity\": 50.0}
        }")

    if [ "$http_code" == "401" ]; then
        echo "HTTP 401 AUTH_FAIL (fail_count +1)"
    elif [ "$http_code" == "403" ]; then
        echo "HTTP 403 DEVICE_BLOCKED ← thiết bị đã bị khoá!"
    else
        echo "HTTP $http_code"
    fi

    sleep 0.3
done

echo ""
echo "→ Kiểm tra trạng thái trên Dashboard: Gateway phải hiện badge đỏ 'Blocked'"
```

### Kết quả mong đợi

```
Lần 1 — HMAC giả: a3f8c2d1e5b7... → HTTP 401 AUTH_FAIL (fail_count +1)
Lần 2 — HMAC giả: 9b2e4f7c1a3d... → HTTP 401 AUTH_FAIL (fail_count +1)
Lần 3 — HMAC giả: 7d1a8e3f2c9b... → HTTP 401 AUTH_FAIL (fail_count +1)
Lần 4 — HMAC giả: 4c6b2a8f5e1d... → HTTP 401 AUTH_FAIL (fail_count +1)
Lần 5 — HMAC giả: 2f9e4c7b1a3d... → HTTP 401 AUTH_FAIL (fail_count +1) ← DEVICE_BLOCKED
Lần 6 — HMAC giả: 1e7c3f9a2b4d... → HTTP 403 DEVICE_BLOCKED ← thiết bị đã bị khoá!
```

### Kiểm tra và mở khoá sau demo

```sql
-- Kiểm tra trong DB
SELECT device_id, status, fail_count FROM devices
WHERE device_id = 'ESP32-GW-XXXXXXXX';
-- status = 'blocked', fail_count = 5

SELECT event_type, details, created_at FROM audit_log
ORDER BY created_at DESC LIMIT 10;
-- Thấy 5 × GATEWAY_AUTH_FAIL + 1 × DEVICE_BLOCKED
```

**Mở khoá trên Frontend:**
Vào **Devices** → click `Demo-Gateway-01` → nút **Unlock** → `status = 'active'`, `fail_count = 0`

---

## 10. Scenario 6 — Blocked Device gửi HMAC hợp lệ

### Mô tả tấn công
Sau khi bị auto-block ở Scenario 5, kẻ tấn công có được `secret_key` (ví dụ flash dump ESP32) và tính HMAC đúng hoàn toàn — vẫn bị từ chối.

### Tại sao tấn công thất bại
```
validateDevice (hmacService — KHÔNG check status):
  Layer 1: verifyGatewayHMAC() → ok: true  ✓ (HMAC đúng)
  Layer 2: verifyDeviceHMAC()  → ok: true  ✓ (HMAC đúng)
  → next()

data.routes.ts handler:
  gwRow = { id: X, device_type: 'gateway', status: 'blocked' }
  if (gwRow.status === 'blocked')
    → res.status(403).json({ error: "DEVICE_BLOCKED" })  ← BỊ CHẶN TẠI ĐÂY
```

### Lệnh thực hiện
```bash
echo "=== SCENARIO 6: Blocked device — HMAC đúng nhưng status=blocked ==="
GW_TS=$(ts); SN_TS=$(ts)
GW_HMAC_OK=$(hmac "$GW_SECRET" "${GW_ID}:${GW_TS}")
SN_HMAC_OK=$(hmac "$SN_SECRET" "${SN_ID}:${SN_TS}")

post_data "{
  \"gateway_id\":   \"$GW_ID\",
  \"gw_timestamp\": $GW_TS,
  \"gw_hmac\":      \"$GW_HMAC_OK\",
  \"sensor_payload\": {
    \"sensor_id\":    \"$SN_ID\",
    \"sn_timestamp\": $SN_TS,
    \"sn_hmac\":      \"$SN_HMAC_OK\",
    \"data\":         { \"temperature\": 28.0, \"humidity\": 65.0 }
  }
}"
```

### Kết quả mong đợi
```json
HTTP 403
{ "error": "DEVICE_BLOCKED", "detail": "Gateway is blocked" }
```

---

## 11. Scenario 7 — Unregistered Device

### Mô tả tấn công
Một ESP32 chưa bao giờ được đăng ký vào hệ thống (mua ngoài, do kẻ tấn công mang vào) cố gửi dữ liệu lên server.

```
Kẻ tấn công có:  ESP32 mới + biết endpoint URL
Kẻ tấn công làm: Tự đặt device_id = "ESP32-GW-HACKER01"
                  Tự tính HMAC từ một secret_key bịa đặt
```

### Tại sao tấn công thất bại

**Bước đầu tiên trong `hmacService.ts:13-18`:**
```typescript
async function fetchDevice(device_id: string): Promise<DeviceRow | null> {
    const [rows] = await pool.execute<any[]>(
        `SELECT id, secret_key, status, fail_count
         FROM devices WHERE device_id = ? LIMIT 1`,
        [device_id]   // ← Prepared statement, không thể inject SQL
    );
    return rows.length > 0 ? (rows[0] as DeviceRow) : null;
    // → trả về null nếu device_id không tồn tại
}

// Trong verifyGatewayHMAC():
const device = await fetchDevice(gateway_id);
if (!device) return { ok: false, error: "NOT_FOUND" };
//                                       ↑
//           Thoát ngay, không cần tính HMAC
```

**Quan trọng:** Server không bao giờ tiết lộ lý do cụ thể (device không tồn tại hay HMAC sai) — cả hai đều trả về `GATEWAY_AUTH_FAIL`. Điều này ngăn kẻ tấn công dùng phản hồi để đoán `device_id` hợp lệ.

### Lệnh thực hiện

```bash
echo "=== SCENARIO 4: Unregistered Device ==="
echo "Gửi request với device_id hoàn toàn không tồn tại trong DB"
echo ""

FAKE_TS=$(ts)
FAKE_GW_HMAC=$(openssl rand -hex 32)
FAKE_SN_HMAC=$(openssl rand -hex 32)

post_data "{
  \"gateway_id\":   \"ESP32-GW-HACKER01\",
  \"gw_timestamp\": $FAKE_TS,
  \"gw_hmac\":      \"$FAKE_GW_HMAC\",
  \"sensor_id\":    \"ESP32-SN-HACKER01\",
  \"sn_timestamp\": $FAKE_TS,
  \"sn_hmac\":      \"$FAKE_SN_HMAC\",
  \"data\":         { \"temperature\": 30.0, \"humidity\": 70.0 }
}"
```

### Kết quả mong đợi

```
HTTP 401
{
    "error": "GATEWAY_AUTH_FAIL",
    "reason": "NOT_FOUND"
}
```

### So sánh Scenario 1 vs Scenario 4

| Thuộc tính | Scenario 1 (Spoofing) | Scenario 4 (Unregistered) |
|---|---|---|
| `device_id` | Có trong DB | Không có trong DB |
| `secret_key` | Không biết | Không có |
| Điểm bị chặn | HMAC so sánh thất bại | DB lookup trả về null |
| Error code | `HMAC_MISMATCH` | `NOT_FOUND` |
| HTTP response | 401 `GATEWAY_AUTH_FAIL` | 401 `GATEWAY_AUTH_FAIL` |
| fail_count tăng? | Có (vì device tồn tại) | Không (không có DB record) |

---

## 12. Scenario 8 — Privilege Escalation: Sensor giả làm Gateway

### Mô tả tấn công
Một Sensor Node (thiết bị `device_type = 'sensor'`) cố gạt qua lớp Gateway bằng cách **đặt chính `sensor_id` của mình vào trường `gateway_id`**. Nó có `secret_key` hợp lệ của chính nó, nên HMAC tính đúng — nhưng sai vai trò.

```
Sensor muốn gửi trực tiếp (bypass Gateway):
  gateway_id = "ESP32-SN-001"  ← dùng SN_ID thay vì GW_ID
  gw_hmac    = HMAC(SN_SECRET, "ESP32-SN-001:timestamp")  ← đúng kỹ thuật!
  sensor_id  = "ESP32-SN-001"  ← giống gateway_id
  sn_hmac    = HMAC(SN_SECRET, "ESP32-SN-001:timestamp")  ← đúng kỹ thuật!
```

### Tại sao HMAC pass nhưng vẫn bị reject

**HMAC Level 1 và Level 2 đều PASS** — vì `SN_SECRET` là key thật, HMAC tính đúng.

**Nhưng RBAC check trong `data.routes.ts:36-43` thất bại:**
```typescript
// Fetch device_type từ DB
const gwRow = rows.find(r => r.id === gateway.id);
const snRow = rows.find(r => r.id === sensor.id);

// RBAC: device_type check
if (!gwRow || gwRow.device_type !== "gateway") {
    // gwRow.device_type = 'sensor' (vì ESP32-SN-001 là sensor)
    // 'sensor' !== 'gateway' → TRUE → block
    res.status(403).json({
        error: "INVALID_DEVICE_TYPE",
        detail: "gateway_id must be a gateway device"
    });
    return;
}
```

**Toàn bộ luồng:**
```
validateDevice middleware:
  Level 1: verifyGatewayHMAC("ESP32-SN-001", ts, hmac)
    → fetchDevice("ESP32-SN-001") → tìm thấy (sensor tồn tại)
    → isTimestampValid() → OK
    → safeCompare(expected, hmac) → TRUE (HMAC đúng!)
    → { ok: true, device: {...} }
  Level 2: verifyDeviceHMAC("ESP32-SN-001", ts, hmac) → TRUE (cũng pass)
  → next()

data.routes handler:
  gwRow = {id: X, device_type: 'sensor', status: 'active'}
  gwRow.device_type ('sensor') !== 'gateway' → TRUE
  → 403 INVALID_DEVICE_TYPE  ← BỊ CHẶN TẠI ĐÂY
```

**Ý nghĩa:** Dù HMAC có đúng, thiết bị **không thể thực hiện hành động vượt quá quyền hạn của mình**. Sensor chỉ được phép nhận dữ liệu, không được đóng vai Gateway để forward.

### Lệnh thực hiện

```bash
echo "=== SCENARIO 5: Privilege Escalation ==="
echo "Sensor dùng sensor_id làm gateway_id — HMAC đúng nhưng sai role"
echo ""

PRIV_TS=$(ts)
# Sensor tính HMAC đúng từ SN_SECRET — nhưng giả vờ là Gateway
SN_AS_GW_HMAC=$(hmac "$SN_SECRET" "${SN_ID}:${PRIV_TS}")

echo "Payload đặc biệt:"
echo "  gateway_id = SN_ID = $SN_ID  ← cố tình dùng sensor làm gateway"
echo "  gw_hmac    = HMAC(SN_SECRET, SN_ID:ts) = ${SN_AS_GW_HMAC:0:20}...  ← đúng kỹ thuật"
echo ""

post_data "{
  \"gateway_id\":   \"$SN_ID\",
  \"gw_timestamp\": $PRIV_TS,
  \"gw_hmac\":      \"$SN_AS_GW_HMAC\",
  \"sensor_id\":    \"$SN_ID\",
  \"sn_timestamp\": $PRIV_TS,
  \"sn_hmac\":      \"$SN_AS_GW_HMAC\",
  \"data\":         { \"temperature\": 25.0, \"humidity\": 60.0 }
}"
```

### Kết quả mong đợi

```
HTTP 403
{
    "error": "INVALID_DEVICE_TYPE",
    "detail": "gateway_id must be a gateway device"
}
```

> **Lưu ý khi giải thích:** HTTP là **403** (Forbidden) thay vì 401 (Unauthorized). Điều này phân biệt: 401 = chưa xác thực được danh tính, 403 = xác thực được danh tính nhưng không có quyền thực hiện hành động.

---

## 13. Scenario 9 — Inactive Device

### Mô tả tấn công
Thiết bị mới đăng ký nhưng chưa được admin kích hoạt (status=`inactive`) cố gửi dữ liệu. HMAC đúng hoàn toàn — bị chặn bởi status check.

### Điều kiện
```
Thiết bị mới đăng ký:
  status   = 'inactive'   ← mặc định khi register
  fail_count = 0
  secret_key = <valid key>
```

### Luồng code
```
validateDevice → PASS (HMAC đúng)
data.routes.ts:
  gwRow.status = 'inactive'
  gwRow.status !== 'active' → TRUE
  → res.status(403).json({ error: "DEVICE_NOT_ACTIVE" })
```

### Lệnh thực hiện (cần admin JWT)
```bash
echo "=== SCENARIO 9: Inactive device ==="

# Đăng nhập admin lấy cookie
curl -s -c /tmp/admin_cookie.jar -X POST "$BACKEND/api/auth/login" \
    -H "Content-Type: application/json" \
    -d '{"username":"admin","password":"admin123"}' > /dev/null

# Đăng ký gateway mới (status=inactive)
REG=$(curl -s -b /tmp/admin_cookie.jar -X POST "$BACKEND/api/devices/register" \
    -H "Content-Type: application/json" \
    -d '{"device_name":"Demo-Inactive","device_type":"gateway"}')
NEW_GW_ID=$(python3 -c "import json,sys; print(json.loads(sys.argv[1]).get('device_id',''))" "$REG")
NEW_GW_SEC=$(python3 -c "import json,sys; print(json.loads(sys.argv[1]).get('secret_key',''))" "$REG")
echo "Gateway mới: $NEW_GW_ID (status=inactive)"

# Gửi data với HMAC đúng
NEW_TS=$(ts)
NEW_GW_HMAC=$(hmac "$NEW_GW_SEC" "${NEW_GW_ID}:${NEW_TS}")
NEW_SN_HMAC=$(hmac "$SN_SECRET" "${SN_ID}:${NEW_TS}")

post_data "{
  \"gateway_id\":   \"$NEW_GW_ID\",
  \"gw_timestamp\": $NEW_TS,
  \"gw_hmac\":      \"$NEW_GW_HMAC\",
  \"sensor_payload\": {
    \"sensor_id\":    \"$SN_ID\",
    \"sn_timestamp\": $NEW_TS,
    \"sn_hmac\":      \"$NEW_SN_HMAC\",
    \"data\":         { \"temperature\": 27.0, \"humidity\": 63.0 }
  }
}"
```

### Kết quả mong đợi
```json
HTTP 403
{ "error": "DEVICE_NOT_ACTIVE", "detail": "Gateway is not active" }
```

---

## 14. Scenario 10 — RBAC Violation qua REST API

### Mô tả tấn công
Người dùng có tài khoản hợp lệ (role=`viewer`) cố gọi các endpoint yêu cầu quyền cao hơn. Đây là vector tấn công **hoàn toàn khác** — không liên quan đến HMAC, tấn công qua giao diện web.

### Quy tắc RBAC cho REST API
```
GET    /api/users           → requireRole("admin")
POST   /api/users           → requireRole("admin")
PATCH  /api/devices/:id/status → requireRole("admin", "operator")
DELETE /api/devices/:id     → requireRole("admin")
DELETE /api/audit-log/*     → requireRole("admin")
```

### Luồng code khi viewer gọi admin endpoint
```
viewer JWT → verifyJWT() → ok (JWT hợp lệ)
           → requireRole("admin") → role="viewer" ∉ ["admin"]
           → res.status(403).json({ error: "FORBIDDEN" })
```

### Lệnh thực hiện
```bash
echo "=== SCENARIO 10: RBAC Violation — Viewer gọi admin API ==="

# Đăng nhập admin
curl -s -c /tmp/admin_cookie.jar -X POST "$BACKEND/api/auth/login" \
    -H "Content-Type: application/json" \
    -d '{"username":"admin","password":"admin123"}' > /dev/null

# Tạo viewer tạm thời
curl -s -b /tmp/admin_cookie.jar -X POST "$BACKEND/api/users" \
    -H "Content-Type: application/json" \
    -d '{"username":"tmp_viewer","password":"ViewerPass1!","role":"viewer"}' > /dev/null

# Đăng nhập viewer
curl -s -c /tmp/viewer_cookie.jar -X POST "$BACKEND/api/auth/login" \
    -H "Content-Type: application/json" \
    -d '{"username":"tmp_viewer","password":"ViewerPass1!"}' > /dev/null

# Test 1: Viewer cố GET /api/users (admin-only)
echo "--- Test 1: Viewer GET /api/users ---"
curl -s -w '\nHTTP %{http_code}' -b /tmp/viewer_cookie.jar "$BACKEND/api/users"

# Test 2: Viewer cố PATCH device status (admin/operator only)
echo ""
echo "--- Test 2: Viewer PATCH /api/devices/:id/status ---"
curl -s -w '\nHTTP %{http_code}' -b /tmp/viewer_cookie.jar \
    -X PATCH "$BACKEND/api/devices/1/status" \
    -H "Content-Type: application/json" \
    -d '{"status":"blocked"}'

# Test 3: Viewer cố DELETE device (admin-only)
echo ""
echo "--- Test 3: Viewer DELETE /api/devices/1 ---"
curl -s -w '\nHTTP %{http_code}' -b /tmp/viewer_cookie.jar \
    -X DELETE "$BACKEND/api/devices/1"
```

### Kết quả mong đợi (cả 3 test)
```json
HTTP 403
{ "error": "FORBIDDEN" }
```

> **Điểm phân biệt với device attacks:** HTTP là **403** (có JWT hợp lệ, đúng danh tính, sai quyền), không phải 401 (chưa xác thực). JWT bảo vệ API quản trị, HMAC bảo vệ luồng dữ liệu IoT — hai cơ chế độc lập.

---

## 15. Scenario SQL Injection (bonus)

### Mô tả tấn công
Kẻ tấn công nhúng mã SQL vào trường `gateway_id` với mục tiêu:
- Bypass xác thực: `' OR '1'='1` → câu SELECT luôn trả về kết quả
- Exfiltration: `' UNION SELECT secret_key FROM devices--` → lấy tất cả secret key

### Payload nguy hiểm (nếu KHÔNG có prepared statements)

```sql
-- Nếu server dùng string concatenation:
SELECT id, secret_key FROM devices WHERE device_id = '' OR '1'='1'
-- → Trả về tất cả records → bypass xác thực!

SELECT id, secret_key FROM devices WHERE device_id = ''
UNION SELECT secret_key, '' FROM devices--'
-- → Lấy toàn bộ secret keys!
```

### Tại sao tấn công thất bại — Prepared Statements

**Code thực tế trong `hmacService.ts:14-17`:**
```typescript
const [rows] = await pool.execute<any[]>(
    `SELECT id, secret_key, status, fail_count
     FROM devices WHERE device_id = ? LIMIT 1`,
    [device_id]   // ← Tham số được truyền tách biệt
);
```

**Cơ chế hoạt động của Prepared Statements:**
```
1. Server gửi template SQL đến MySQL trước:
   "SELECT ... WHERE device_id = ?"
   MySQL parse và compile câu query này một lần.

2. Server gửi giá trị tham số riêng:
   device_id = "' OR '1'='1"

3. MySQL ghép: device_id được ESCAPE tự động:
   WHERE device_id = '\' OR \'1\'=\'1'
   → Tìm thiết bị tên "\' OR \'1\'=\'1" → không tìm thấy → NOT_FOUND

4. SQL trong giá trị KHÔNG BAO GIỜ được execute.
```

### Lệnh thực hiện

```bash
echo "=== SCENARIO 6: SQL Injection ==="
echo ""

INJECT_TS=$(ts)

# Payload 1: Boolean-based bypass
echo "--- Payload 1: OR bypass ---"
post_data "{
  \"gateway_id\":   \"' OR '1'='1\",
  \"gw_timestamp\": $INJECT_TS,
  \"gw_hmac\":      \"fake\",
  \"sensor_id\":    \"' OR '1'='1\",
  \"sn_timestamp\": $INJECT_TS,
  \"sn_hmac\":      \"fake\",
  \"data\":         {}
}"

echo ""
echo "--- Payload 2: UNION-based exfiltration ---"
post_data "{
  \"gateway_id\":   \"' UNION SELECT id, secret_key, status, fail_count FROM devices--\",
  \"gw_timestamp\": $INJECT_TS,
  \"gw_hmac\":      \"fake\",
  \"sensor_id\":    \"normal\",
  \"sn_timestamp\": $INJECT_TS,
  \"sn_hmac\":      \"fake\",
  \"data\":         {}
}"

echo ""
echo "--- Payload 3: DROP TABLE ---"
post_data "{
  \"gateway_id\":   \"ESP32'; DROP TABLE devices;--\",
  \"gw_timestamp\": $INJECT_TS,
  \"gw_hmac\":      \"fake\",
  \"sensor_id\":    \"normal\",
  \"sn_timestamp\": $INJECT_TS,
  \"sn_hmac\":      \"fake\",
  \"data\":         {}
}"
```

### Kết quả mong đợi (tất cả 3 payload)

```
HTTP 401
{
    "error": "GATEWAY_AUTH_FAIL",
    "reason": "NOT_FOUND"
}
```

Không có DB leak, không có bảng bị xóa.

### Xác nhận DB vẫn toàn vẹn

```sql
SHOW TABLES;
-- Vẫn đủ 5 bảng: users, devices, sensor_data, device_tokens, audit_log

SELECT COUNT(*) FROM devices;
-- Số lượng thiết bị không thay đổi
```

---

## 16. Kiểm tra Audit Log & Dashboard

### Xem Audit Log trên giao diện Web

1. Truy cập **http://localhost:3000/audit**
2. Filter theo **Event Type**:

| Event Type | Màu | Ý nghĩa |
|---|---|---|
| `DATA_RECV` | Xanh lá | Dữ liệu nhận thành công |
| `GATEWAY_AUTH_FAIL` | Đỏ | Gateway xác thực thất bại |
| `SENSOR_AUTH_FAIL` | Cam | Sensor xác thực thất bại |
| `DEVICE_BLOCKED` | Đỏ đậm | Thiết bị bị khoá tự động |
| `DEVICE_REGISTER` | Vàng | Đăng ký thiết bị mới |

### Xem trực tiếp trong DB

```powershell
# Kết nối vào MySQL container
docker exec -it managerdeviceiot-mysql-1 `
    mysql -u iot_managerIoT -piot_managerIoTpassword iot_managerDeviceIoT
```

```sql
-- Toàn bộ sự kiện bảo mật, mới nhất trước
SELECT
    al.event_type,
    d.device_id,
    al.ip_address,
    al.details,
    al.created_at
FROM audit_log al
LEFT JOIN devices d ON al.device_id = d.id
ORDER BY al.created_at DESC
LIMIT 20;

-- Thống kê theo loại sự kiện
SELECT event_type, COUNT(*) AS total
FROM audit_log
GROUP BY event_type
ORDER BY total DESC;

-- Trạng thái thiết bị sau demo
SELECT device_id, device_type, status, fail_count,
       last_seen, created_at
FROM devices
ORDER BY created_at DESC;

-- Dữ liệu sensor đã được lưu (Scenario 0)
SELECT
    d.device_id  AS sensor,
    gw.device_id AS via_gateway,
    sd.payload,
    sd.received_at
FROM sensor_data sd
JOIN devices d  ON sd.device_id  = d.id
JOIN devices gw ON sd.gateway_id = gw.id
ORDER BY sd.received_at DESC
LIMIT 5;
```

### Xem log backend real-time trong khi demo

```powershell
# Mở terminal riêng để xem log
docker compose logs -f backend
```

Log backend sẽ in ra từng request, HTTP status, và lỗi chi tiết.

---

## 17. Bảng tổng kết STRIDE

| # | Kịch bản | STRIDE | Điểm bị chặn trong code | HTTP | Audit Event |
|---|---|---|---|---|---|
| 0 | Baseline hợp lệ | — | Pass toàn bộ | `200` | `DATA_RECV` |
| 1 | Gateway HMAC giả mạo | **S**poofing | `safeCompare()` → false (Layer 1) | `401` | `GATEWAY_AUTH_FAIL` reason: `HMAC_MISMATCH` |
| 2 | Sensor HMAC giả mạo | **S**poofing | `safeCompare()` → false (Layer 2) | `401` | `SENSOR_AUTH_FAIL` reason: `HMAC_MISMATCH` |
| 3 | Replay – timestamp cũ | **T**ampering | `isTimestampValid()` → false | `401` | `REPLAY_ATTACK` reason: `TIMESTAMP_EXPIRED` |
| 4 | Replay – timestamp tương lai | **T**ampering | `isTimestampValid()` → false | `401` | `REPLAY_ATTACK` reason: `TIMESTAMP_EXPIRED` |
| 5 | Brute Force → Auto Block | **D**oS | `fail_count ≥ 5` → `blockDevice()` | `401×5` | `GATEWAY_AUTH_FAIL` ×5 + `DEVICE_BLOCKED` |
| 6 | Blocked device HMAC đúng | **T**ampering | `data.routes: status='blocked'` | `403` | — |
| 7 | Unregistered Device | **S**poofing | `fetchDevice()` → null | `401` | `GATEWAY_AUTH_FAIL` reason: `NOT_FOUND` |
| 8 | Privilege Escalation (type) | **E**levation | `device_type !== 'gateway'` | `403` | `PRIVILEGE_ESCALATION` |
| 9 | Inactive Device | **T**ampering | `data.routes: status='inactive'` | `403` | — |
| 10 | RBAC Violation (REST API) | **E**levation | `requireRole()` → role mismatch | `403` | — |
| — | SQL Injection (bonus) | **T**ampering | Prepared statements escape | `401` | `GATEWAY_AUTH_FAIL` reason: `NOT_FOUND` |

### Cơ chế phòng thủ theo lớp

```
Lớp 1 – Input Validation
  └─ Kiểm tra đủ field, format hợp lệ (validateDevice.ts:45-48)

Lớp 2 – Identity Verification (Level 1: Gateway)
  ├─ DB lookup (fetchDevice) — Prepared Statements chống SQL Injection
  ├─ Timestamp Window ±300s — chống Replay Attack
  └─ HMAC timingSafeEqual   — chống Spoofing & Timing Attack

Lớp 3 – Identity Verification (Level 2: Sensor)
  ├─ DB lookup
  ├─ Timestamp Window
  └─ HMAC timingSafeEqual

Lớp 4 – Role-Based Access Control
  └─ device_type check       — chống Privilege Escalation

Lớp 5 – Status Check
  └─ status = 'active'       — chặn thiết bị đã bị block

Lớp 6 – Adaptive Defense
  └─ fail_count → auto-block — chống Brute Force
```

---

## 18. Điểm yếu còn lại & phân tích rủi ro

Phần này dùng cho báo cáo — phân tích các rủi ro mà hệ thống **chưa** giải quyết hoàn toàn.

### 13.1 — Nguy cơ lộ Secret Key

| Tình huống lộ key | Hậu quả | Biện pháp khắc phục |
|---|---|---|
| **Flash dump ESP32** | Đọc được `SECRET_KEY` từ flash memory, tạo token hợp lệ vô thời hạn | Bật ESP32 Secure Boot + NVS Encryption, lưu key trong eFuse |
| **Commit lên GitHub public** | `config.h` chứa key bị index công khai vĩnh viễn | Thêm `config.h` vào `.gitignore`, dùng OTA cấp key |
| **Log server in ra key** | Key xuất hiện trong log file, ai có quyền đọc log là có key | Code review, không log credentials, kiểm tra với `grep -r "secret_key"` trong log |
| **Database bị breach** | Secret key lưu plain text → toàn bộ key bị lộ | Mã hóa AES-256-GCM trước khi lưu, master key trong env var |
| **Traffic MQTT không mã hóa** | Sniff payload trên mạng LAN (dù HMAC vẫn an toàn) | Bật TLS trên Mosquitto, cổng 8883 thay vì 1883 |

### 13.2 — Kịch bản tấn công vật lý (Out of scope nhưng nên đề cập)

```
Kẻ tấn công lấy được ESP32 vật lý:
1. Cắm vào máy tính
2. Dùng esptool.py để đọc flash:
   python -m esptool --port COM3 read_flash 0 0x400000 firmware_dump.bin
3. Tìm chuỗi DEVICE_ID và SECRET_KEY trong file dump
4. Tạo request giả với key thật → 200 OK mãi mãi

Giải pháp: ESP32 Secure Boot V2 + Flash Encryption
```

### 13.3 — Giải pháp Key Rotation (đề xuất)

```
Khi phát hiện key bị lộ:
1. Admin click "Rotate Key" trên Dashboard
2. Backend sinh secret_key mới
3. Thiết bị nhận key mới qua kênh bảo mật (OTA hoặc Serial được mã hóa)
4. Key cũ bị revoke sau 24 giờ
5. Mọi request dùng key cũ → HMAC_MISMATCH → 401
```

---

## Thứ tự demo khuyên dùng (25 phút)

```
[ 2 phút] Giới thiệu: sơ đồ kiến trúc, 5 lớp bảo vệ
[ 1 phút] S0:  Baseline → 200 OK
[ 2 phút] S1:  Gateway HMAC fake → giải thích timingSafeEqual, Layer 1
[ 1 phút] S2:  Sensor HMAC fake → giải thích Layer 2 độc lập với Layer 1
[ 2 phút] S3:  Replay cũ → giải thích timestamp window ±300s
[ 1 phút] S4:  Replay tương lai → cùng cơ chế, hai chiều
[ 2 phút] S5:  Brute Force → xem Dashboard đổi sang Blocked, xem audit log
[ 1 phút] S6:  Blocked device HMAC đúng → vẫn bị từ chối (403 vs 401)
[ 1 phút] S7:  Unregistered → nhanh
[ 2 phút] S8:  Privilege Escalation → RBAC device_type, HTTP 403 vs 401
[ 1 phút] S9:  Inactive device → phân biệt inactive vs blocked
[ 2 phút] S10: RBAC REST API → viewer cố gọi admin API, 3 test cases
[ 1 phút] SQL Injection bonus → prepared statements, nhanh
[ 2 phút] Audit Log Dashboard → tổng hợp toàn bộ event types
[ 1 phút] Điểm yếu còn lại → flash dump, key rotation
```

**Script tự động (2 file, 11 scenario):**
```bash
# Bước 1 — 5 kịch bản core (S0–S4): Spoofing, Replay, Brute Force, Privilege Escalation
./scripts/attack_demo.sh "$BACKEND" "$GW_ID" "$GW_SECRET" "$SN_ID" "$SN_SECRET"

# Unlock Gateway sau Scenario 3 (Brute Force → blocked), rồi chạy tiếp:

# Bước 2 — 6 kịch bản nâng cao (S5–S10): Sensor Layer 2, Future Replay, Blocked, Unregistered, Inactive, RBAC REST
./scripts/attack_demo_extended.sh "$BACKEND" "$GW_ID" "$GW_SECRET" "$SN_ID" "$SN_SECRET" "admin" "admin123"
```

**Reset sau demo:**
- Vào **Devices** → **Unlock** Gateway bị block (Scenario 3 core)
- Scenario 9 và 10 (extended) tự cleanup thiết bị/user demo
