# Hướng dẫn mô phỏng tấn công IoT — Ubuntu Linux (VMware) → Server Windows

> **Môi trường:**
> - **Máy server:** Windows 11 — chạy hệ thống IoT qua Docker (backend :5000, frontend :3000)
> - **Máy tấn công:** Ubuntu Linux trên VMware Workstation
> - **Công cụ:** Nmap, curl, openssl, python3, MobaXterm

---

## Mục lục

1. [Chuẩn bị Ubuntu](#1-chuẩn-bị-ubuntu)
2. [Cấu hình mạng VMware](#2-cấu-hình-mạng-vmware)
3. [Trinh sát — Quét IP và Port bằng Nmap](#3-trinh-sát--quét-ip-và-port-bằng-nmap)
4. [Lấy thông tin thiết bị từ hệ thống](#4-lấy-thông-tin-thiết-bị-từ-hệ-thống)
5. [Copy script tấn công lên Ubuntu](#5-copy-script-tấn-công-lên-ubuntu)
6. [Chạy Core Attack Demo — 5 kịch bản](#6-chạy-core-attack-demo--5-kịch-bản)
7. [Chạy Extended Attack Demo — 6 kịch bản nâng cao](#7-chạy-extended-attack-demo--6-kịch-bản-nâng-cao)
8. [Quan sát kết quả trên Dashboard](#8-quan-sát-kết-quả-trên-dashboard)
9. [Tấn công thủ công bằng curl từ Ubuntu](#9-tấn-công-thủ-công-bằng-curl-từ-ubuntu)
10. [Bảng tóm tắt kịch bản](#10-bảng-tóm-tắt-kịch-bản)
11. [Xử lý sự cố](#11-xử-lý-sự-cố)

---

## 1. Chuẩn bị Ubuntu

Mở terminal trên Ubuntu VMware, cài các công cụ cần thiết:

```bash
sudo apt update && sudo apt install -y \
    curl \
    openssl \
    nmap \
    python3 \
    net-tools \
    iputils-ping
```

Kiểm tra phiên bản:

```bash
curl --version       # cần >= 7.x
openssl version      # cần >= 1.1.x
nmap --version       # cần >= 7.x
python3 --version    # cần >= 3.6
```

---

## 2. Cấu hình mạng VMware

### Chọn chế độ mạng

Trong **VMware Workstation → VM Settings → Network Adapter**, chọn:

| Chế độ | Mô tả | Khuyến nghị |
|--------|-------|------------|
| **Bridged** | Ubuntu cùng subnet với Windows, có IP riêng | Ưu tiên dùng |
| **NAT** | Ubuntu chia sẻ IP Windows qua NAT | Dùng nếu không có quyền mạng |

### Tìm IP máy Windows từ Ubuntu

```bash
# Xem IP của Ubuntu
ip addr show

# Xem gateway — thường chính là Windows host
ip route | grep default
# Ví dụ: "default via 192.168.188.1 dev ens33"
# → Windows host = 192.168.188.1
```

Hoặc trên **Windows**, mở PowerShell:

```powershell
ipconfig
# Xem "IPv4 Address" trên adapter VMware
```

### Kiểm tra kết nối từ Ubuntu đến Windows

```bash
WINDOWS_IP="192.168.188.1"   # thay bằng IP thực

ping -c 3 $WINDOWS_IP

# Kiểm tra backend
curl http://$WINDOWS_IP:5000/api/health
# Kỳ vọng: {"status":"ok","db":"connected","mqtt":"connected"}
```

Nếu không kết nối được → mở firewall trên **Windows** (PowerShell admin):

```powershell
New-NetFirewallRule -DisplayName "IoT Backend 5000" -Direction Inbound -Protocol TCP -LocalPort 5000 -Action Allow
New-NetFirewallRule -DisplayName "IoT Frontend 3000" -Direction Inbound -Protocol TCP -LocalPort 3000 -Action Allow
```

---

## 3. Trinh sát — Quét IP và Port bằng Nmap

### Bước 3.1 — Phát hiện host trên mạng

```bash
# Thay subnet phù hợp với mạng của bạn
nmap -sn 192.168.188.0/24
```

Kết quả mẫu:

```
Nmap scan report for 192.168.188.1    ← Windows host (server mục tiêu)
Host is up (0.0010s latency).
Nmap scan report for 192.168.188.128  ← Ubuntu (máy tấn công)
Host is up.
```

### Bước 3.2 — Quét port mục tiêu Windows

```bash
nmap -sV -p 3000,5000,1883,8883,3306 $WINDOWS_IP
```

Kết quả mong đợi:

```
PORT     STATE  SERVICE  VERSION
3000/tcp open   http     Node.js (Next.js frontend)
5000/tcp open   http     Node.js (Express backend API)
1883/tcp open   mqtt     Mosquitto MQTT broker
```

### Bước 3.3 — Quét chi tiết OS và service version

```bash
nmap -A -p 3000,5000 $WINDOWS_IP
```

### Bước 3.4 — Gán biến backend URL

```bash
export BACKEND_URL="http://${WINDOWS_IP}:5000"

# Xác nhận backend phản hồi
curl -s "$BACKEND_URL/api/health"
```

---

## 4. Lấy thông tin thiết bị từ hệ thống

Script tấn công cần **GW_ID**, **GW_SECRET**, **SN_ID**, **SN_SECRET** của thiết bị đã đăng ký trong hệ thống.

### Cách 1 — Lấy từ Dashboard qua trình duyệt trên Ubuntu

```
http://<WINDOWS_IP>:3000
Đăng nhập: admin / admin123
Vào Devices → chọn thiết bị → copy Device ID và Secret Key
```

### Cách 2 — Gọi API trực tiếp từ Ubuntu terminal

```bash
# Đăng nhập lấy session cookie
curl -s -c /tmp/admin.jar \
  -X POST "$BACKEND_URL/api/auth/login" \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"admin123"}'

# Lấy danh sách devices
curl -s -b /tmp/admin.jar "$BACKEND_URL/api/devices" | python3 -m json.tool
```

Kết quả mẫu:

```json
[
  {
    "id": 1,
    "device_id": "ESP32-GW-AABBCCDD",
    "device_type": "gateway",
    "secret_key": "abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890",
    "status": "active"
  },
  {
    "id": 2,
    "device_id": "ESP32-SN-XXYYZZ11",
    "device_type": "sensor",
    "secret_key": "1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef",
    "status": "active"
  }
]
```

### Gán biến môi trường

```bash
export GW_ID="ESP32-GW-AABBCCDD"
export GW_SECRET="abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890"
export SN_ID="ESP32-SN-XXYYZZ11"
export SN_SECRET="1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef"

# Xác nhận độ dài secret key (phải là 64 ký tự hex)
echo "GW_SECRET length: $(echo -n "$GW_SECRET" | wc -c)"

# Test tính HMAC — phải ra 64 ký tự hex
TS=$(date +%s)
echo -n "${GW_ID}:${TS}" | openssl dgst -sha256 -hmac "$GW_SECRET" -hex | sed 's/^.* //'
```

---

## 5. Copy script tấn công lên Ubuntu

### Cách A — Dùng MobaXterm

Mở MobaXterm → kết nối SSH đến Ubuntu VMware → dùng tab **SFTP** kéo thả 2 file từ Windows:

```
E:\WorkSpace\managerDeviceIoT-RBAC\scripts\attack_demo.sh
E:\WorkSpace\managerDeviceIoT-RBAC\scripts\attack_demo_extended.sh
```

### Cách B — Python HTTP server tạm từ Windows

Trên **Windows**, mở PowerShell trong thư mục project:

```powershell
cd E:\WorkSpace\managerDeviceIoT-RBAC
python -m http.server 8080 --directory scripts
```

Trên **Ubuntu**:

```bash
mkdir -p ~/attack-demo
cd ~/attack-demo

wget http://$WINDOWS_IP:8080/attack_demo.sh
wget http://$WINDOWS_IP:8080/attack_demo_extended.sh

chmod +x attack_demo.sh attack_demo_extended.sh
```

### Cách C — SCP (nếu Windows có OpenSSH)

```bash
scp <user>@$WINDOWS_IP:"E:/WorkSpace/managerDeviceIoT-RBAC/scripts/attack_demo.sh" ~/attack-demo/
scp <user>@$WINDOWS_IP:"E:/WorkSpace/managerDeviceIoT-RBAC/scripts/attack_demo_extended.sh" ~/attack-demo/
```

---

## 6. Chạy Core Attack Demo — 5 kịch bản

```bash
cd ~/attack-demo

./attack_demo.sh \
  "$BACKEND_URL" \
  "$GW_ID" \
  "$GW_SECRET" \
  "$SN_ID" \
  "$SN_SECRET"
```

### Kết quả mong đợi

```
SCENARIO 0 — Baseline hợp lệ
→ HTTP 200 ✓   DATA_RECV ghi vào audit_log

SCENARIO 1 — Device Spoofing (HMAC deadbeef...)
→ HTTP 401 ✗   GATEWAY_AUTH_FAIL · HMAC_MISMATCH

SCENARIO 2 — Replay Attack (timestamp −700s, HMAC đúng)
→ HTTP 401 ✗   REPLAY_ATTACK · TIMESTAMP_EXPIRED

SCENARIO 3 — Brute Force 6 lần HMAC ngẫu nhiên
  Lần 1-5: HTTP 401  GATEWAY_AUTH_FAIL
  Lần 6:   HTTP 403  DEVICE_BLOCKED  ← Gateway bị khóa

SCENARIO 4 — Privilege Escalation (Sensor giả làm Gateway)
→ HTTP 403 ✗   PRIVILEGE_ESCALATION · device_type='sensor' ≠ 'gateway'
```

> **Sau Scenario 3:** Gateway bị `blocked`. **Không unlock** — Scenario 7 trong script extended cần trạng thái này.

---

## 7. Chạy Extended Attack Demo — 6 kịch bản nâng cao

Chạy ngay tiếp theo, không reset gì cả:

```bash
./attack_demo_extended.sh \
  "$BACKEND_URL" \
  "$GW_ID" \
  "$GW_SECRET" \
  "$SN_ID" \
  "$SN_SECRET" \
  "admin" \
  "admin123"
```

### Kết quả mong đợi

```
SCENARIO 5 — Sensor HMAC fake (Layer 2 fail)
→ HTTP 401 ✗   SENSOR_AUTH_FAIL  [gw_hmac đúng, sn_hmac = 'aaa...']

SCENARIO 6 — Replay Attack (timestamp tương lai +700s)
→ HTTP 401 ✗   REPLAY_ATTACK · TIMESTAMP_EXPIRED

SCENARIO 7 — Blocked device gửi HMAC đúng
→ HTTP 403 ✗   DEVICE_BLOCKED  [HMAC pass, nhưng status='blocked']

SCENARIO 8 — Unregistered device (ESP32-GW-NOTEXIST)
→ HTTP 401 ✗   GATEWAY_AUTH_FAIL · NOT_FOUND

SCENARIO 9 — Inactive device (script tự deactivate → gửi data → restore)
→ HTTP 403 ✗   DEVICE_NOT_ACTIVE

SCENARIO 10 — RBAC: Viewer cố xóa audit log (admin only)
  GET  /api/audit-log   → HTTP 200 ✓  (viewer được đọc)
  DELETE /api/audit-log → HTTP 403 ✗  (chỉ admin xóa được)
  GET  /api/users       → HTTP 403 ✗  (admin-only endpoint)
```

---

## 8. Quan sát kết quả trên Dashboard

Mở trình duyệt trên Ubuntu:

```
http://<WINDOWS_IP>:3000
```

| Trang | Thứ cần xem |
|-------|------------|
| `/audit` | Các event: `HMAC_MISMATCH`, `REPLAY_ATTACK`, `DEVICE_BLOCKED`, `SENSOR_AUTH_FAIL`, `PRIVILEGE_ESCALATION` |
| `/devices` | Cột **Status** — Gateway chuyển sang badge đỏ `blocked` sau Scenario 3 |
| `/devices/<id>` | `threat_status`: `normal` / `suspicious` / `attack` |

### Unlock Gateway sau khi demo xong

```bash
# Lấy device DB id của Gateway
DEVICES=$(curl -s -b /tmp/admin.jar "$BACKEND_URL/api/devices")
GW_DB_ID=$(echo "$DEVICES" | python3 -c "
import json, sys
devices = json.load(sys.stdin)
for d in (devices if isinstance(devices, list) else devices.get('data', [])):
    if d.get('device_id') == '${GW_ID}':
        print(d.get('id',''))
        break
")

# Unlock
curl -s -b /tmp/admin.jar \
  -X PATCH "$BACKEND_URL/api/devices/$GW_DB_ID" \
  -H "Content-Type: application/json" \
  -d '{"status":"active"}'
```

---

## 9. Tấn công thủ công bằng curl từ Ubuntu

Nếu muốn tự gõ lệnh curl để hiểu rõ từng bước, dùng các ví dụ sau:

### Hàm HMAC helper

```bash
hmac_sha256() { echo -n "$2" | openssl dgst -sha256 -hmac "$1" -hex | sed 's/^.* //'; }
now_ts() { date +%s; }
```

### Scenario 0 — Request hợp lệ

```bash
GW_TS=$(now_ts); SN_TS=$(now_ts)
GW_HMAC=$(hmac_sha256 "$GW_SECRET" "${GW_ID}:${GW_TS}")
SN_HMAC=$(hmac_sha256 "$SN_SECRET" "${SN_ID}:${SN_TS}")

curl -s -w "\nHTTP %{http_code}\n" \
  -X POST "$BACKEND_URL/api/device/data" \
  -H "Content-Type: application/json" \
  -d "{
    \"gateway_id\":   \"$GW_ID\",
    \"gw_timestamp\": $GW_TS,
    \"gw_hmac\":      \"$GW_HMAC\",
    \"sensor_payload\": {
      \"sensor_id\":    \"$SN_ID\",
      \"sn_timestamp\": $SN_TS,
      \"sn_hmac\":      \"$SN_HMAC\",
      \"data\":         {\"temperature\":28.5,\"humidity\":65.0}
    }
  }"
# Kỳ vọng: HTTP 200
```

### Scenario 1 — Device Spoofing (HMAC giả)

```bash
GW_TS=$(now_ts)
curl -s -w "\nHTTP %{http_code}\n" \
  -X POST "$BACKEND_URL/api/device/data" \
  -H "Content-Type: application/json" \
  -d "{
    \"gateway_id\":   \"$GW_ID\",
    \"gw_timestamp\": $GW_TS,
    \"gw_hmac\":      \"deadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeef\",
    \"sensor_payload\": {
      \"sensor_id\":    \"$SN_ID\",
      \"sn_timestamp\": $GW_TS,
      \"sn_hmac\":      \"cafebabecafebabecafebabecafebabecafebabecafebabecafebabecafebabe00\",
      \"data\":         {\"temperature\":99.9,\"humidity\":0.0}
    }
  }"
# Kỳ vọng: HTTP 401 GATEWAY_AUTH_FAIL
```

### Scenario 2 — Replay Attack (timestamp cũ)

```bash
OLD_TS=$(($(now_ts) - 700))
GW_HMAC_OLD=$(hmac_sha256 "$GW_SECRET" "${GW_ID}:${OLD_TS}")
SN_HMAC_OLD=$(hmac_sha256 "$SN_SECRET" "${SN_ID}:${OLD_TS}")

curl -s -w "\nHTTP %{http_code}\n" \
  -X POST "$BACKEND_URL/api/device/data" \
  -H "Content-Type: application/json" \
  -d "{
    \"gateway_id\":   \"$GW_ID\",
    \"gw_timestamp\": $OLD_TS,
    \"gw_hmac\":      \"$GW_HMAC_OLD\",
    \"sensor_payload\": {
      \"sensor_id\":    \"$SN_ID\",
      \"sn_timestamp\": $OLD_TS,
      \"sn_hmac\":      \"$SN_HMAC_OLD\",
      \"data\":         {\"temperature\":25.0,\"humidity\":60.0}
    }
  }"
# Kỳ vọng: HTTP 401 REPLAY_ATTACK
```

### Scenario 3 — Brute Force vòng lặp

```bash
for i in $(seq 1 6); do
    GW_TS=$(now_ts)
    echo -n "Lần $i: "
    curl -s -o /dev/null -w "HTTP %{http_code}\n" \
      -X POST "$BACKEND_URL/api/device/data" \
      -H "Content-Type: application/json" \
      -d "{
        \"gateway_id\":   \"$GW_ID\",
        \"gw_timestamp\": $GW_TS,
        \"gw_hmac\":      \"$(openssl rand -hex 32)\",
        \"sensor_payload\": {
          \"sensor_id\":    \"$SN_ID\",
          \"sn_timestamp\": $GW_TS,
          \"sn_hmac\":      \"$(openssl rand -hex 32)\",
          \"data\":         {\"temperature\":20.0,\"humidity\":50.0}
        }
      }"
    sleep 0.5
done
# Kỳ vọng: 401 × 5 → 403 lần thứ 6
```

### Scenario 4 — Privilege Escalation

```bash
PRIV_TS=$(now_ts)
SN_HMAC_AS_GW=$(hmac_sha256 "$SN_SECRET" "${SN_ID}:${PRIV_TS}")

curl -s -w "\nHTTP %{http_code}\n" \
  -X POST "$BACKEND_URL/api/device/data" \
  -H "Content-Type: application/json" \
  -d "{
    \"gateway_id\":   \"$SN_ID\",
    \"gw_timestamp\": $PRIV_TS,
    \"gw_hmac\":      \"$SN_HMAC_AS_GW\",
    \"sensor_payload\": {
      \"sensor_id\":    \"$SN_ID\",
      \"sn_timestamp\": $PRIV_TS,
      \"sn_hmac\":      \"$SN_HMAC_AS_GW\",
      \"data\":         {\"temperature\":25.0,\"humidity\":60.0}
    }
  }"
# Kỳ vọng: HTTP 403 PRIVILEGE_ESCALATION
```

---

## 10. Bảng tóm tắt kịch bản

| # | Tên tấn công | Kỹ thuật | HTTP | Cơ chế phòng thủ |
|---|-------------|----------|------|-----------------|
| S0 | Baseline hợp lệ | HMAC + timestamp đúng | **200** | — |
| S1 | Device Spoofing | HMAC `deadbeef...` giả | **401** | `timingSafeEqual()` |
| S2 | Replay Attack (cũ) | Timestamp −700s | **401** | `\|now−ts\| ≤ 300s` |
| S3 | Brute Force | 6× HMAC ngẫu nhiên | **401→403** | `fail_count ≥ 5` |
| S4 | Privilege Escalation | Sensor dùng `gateway_id` | **403** | RBAC `device_type` |
| S5 | Sensor HMAC fake | Layer 2: sn_hmac `aaa...` | **401** | 2-layer HMAC độc lập |
| S6 | Replay Attack (tương lai) | Timestamp +700s | **401** | `\|now−ts\| ≤ 300s` |
| S7 | Blocked device | HMAC đúng, status=`blocked` | **403** | Status check sau HMAC |
| S8 | Unregistered device | `gateway_id` không có trong DB | **401** | DB lookup thất bại |
| S9 | Inactive device | Admin deactivate → gửi data | **403** | Status check |
| S10 | RBAC REST API | Viewer gọi DELETE audit-log | **403** | `requireRole('admin')` |

---

## 11. Xử lý sự cố

### Lỗi: `curl: (7) Failed to connect`

```bash
# Kiểm tra backend có chạy không (trên Windows)
# PowerShell:
docker compose ps

# Kiểm tra firewall Windows — mở port
# PowerShell admin:
netsh advfirewall firewall add rule name="IoT5000" dir=in action=allow protocol=TCP localport=5000
```

### Lỗi: Scenario 0 trả 401 (request hợp lệ vẫn bị từ chối)

```bash
# Kiểm tra secret key đúng chưa
echo "GW_SECRET length: $(echo -n "$GW_SECRET" | wc -c)"
# Phải là 64

# Kiểm tra thiết bị status=active chưa
curl -s -b /tmp/admin.jar "$BACKEND_URL/api/devices" | \
  python3 -c "import json,sys; [print(d['device_id'], d['status']) for d in json.load(sys.stdin)]"
```

### Lỗi: Scenario 3 không block sau 5 lần

```bash
# Kiểm tra fail_count hiện tại
curl -s -b /tmp/admin.jar "$BACKEND_URL/api/devices" | \
  python3 -c "import json,sys; [print(d['device_id'], 'fail_count:', d.get('fail_count',0)) for d in json.load(sys.stdin)]"
```

### Lỗi: Script crash ngay đầu

```bash
# Chạy debug mode
bash -x ~/attack-demo/attack_demo.sh "$BACKEND_URL" "$GW_ID" "$GW_SECRET" "$SN_ID" "$SN_SECRET"
```

### Lỗi: `python3: command not found`

```bash
sudo apt install -y python3
```

### VMware: Ubuntu không ping được Windows

1. **VMware → VM Settings → Network Adapter** → đổi sang **Bridged**
2. Tắt firewall Windows tạm để test (PowerShell admin):
   ```powershell
   Set-NetFirewallProfile -Profile Domain,Public,Private -Enabled False
   # Nhớ bật lại sau:
   Set-NetFirewallProfile -Profile Domain,Public,Private -Enabled True
   ```

---

> **Lưu ý:** Chỉ chạy trên hệ thống lab của chính bạn.
> Không dùng script này nhắm vào hệ thống của người khác.

---

*Script gốc: [attack_demo.sh](attack_demo.sh) · [attack_demo_extended.sh](attack_demo_extended.sh)*
*Hướng dẫn đầy đủ local (Windows): [ATTACK_SIMULATION_GUIDE.md](ATTACK_SIMULATION_GUIDE.md)*
