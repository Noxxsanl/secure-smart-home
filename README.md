<div align="center">

# Secure Smart Home IoT System

**Full-stack IoT platform with multi-layer security: dual MQTT brokers, two-layer HMAC authentication, RBAC access control, and ESP32 firmware.**

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![Node.js](https://img.shields.io/badge/Node.js-20.x-green?logo=node.js)](https://nodejs.org)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.x-blue?logo=typescript)](https://typescriptlang.org)
[![Next.js](https://img.shields.io/badge/Next.js-16-black?logo=next.js)](https://nextjs.org)
[![Docker](https://img.shields.io/badge/Docker-Compose-2496ED?logo=docker)](https://docker.com)
[![PlatformIO](https://img.shields.io/badge/PlatformIO-ESP32-orange?logo=platformio)](https://platformio.org)
[![MySQL](https://img.shields.io/badge/MySQL-8.0-4479A1?logo=mysql)](https://mysql.com)

</div>

---

## Overview

Secure Smart Home IoT System is a production-oriented platform for collecting, authenticating, and visualizing data from ESP32 sensor nodes. The system enforces security at every layer — from embedded firmware signing to backend identity verification — using a **dual-broker MQTT architecture** and **two-layer HMAC-SHA256** challenge.

**Key security properties:**

- Every sensor payload is cryptographically signed before it leaves the ESP32
- The gateway independently re-verifies each sensor signature before forwarding
- The backend performs a second independent verification of both gateway and sensor signatures
- Devices are automatically blocked after 5 consecutive authentication failures
- All security events are immutably recorded in an audit log

---

## Đề Tài

**Thiết kế và xây dựng hệ thống nhà thông minh an toàn dựa trên IoT**

| | |
|---|---|
| **Mục tiêu** | Xây dựng hệ thống Smart Home có khả năng điều khiển và giám sát từ xa với các cơ chế bảo mật tích hợp. |
| **Kết quả dự kiến** | Hệ thống Smart Home hoàn chỉnh · Gateway IoT · Server và Web Dashboard · Module AI dự đoán hành vi. |

**Nội dung thực hiện:**

- Xây dựng các nút IoT điều khiển đèn, quạt, cảm biến.
- Phát triển Gateway IoT.
- Xây dựng server và Web Dashboard.
- Triển khai: xác thực thiết bị · mã hóa MQTT bằng TLS · phân quyền người dùng.
- Tích hợp AI: học thói quen sử dụng để tự động điều khiển thiết bị.

### Trạng thái triển khai

Codebase hiện tại đã có phần nền tảng (Gateway, Server, Dashboard, xác thực thiết bị, phân quyền). Các phần còn lại sẽ được phát triển tiếp trên nền codebase này.

| Hạng mục | Trạng thái |
|----------|:----------:|
| Gateway IoT (dual-broker bridge) | ✅ Đã có |
| Server + Web Dashboard | ✅ Đã có |
| Xác thực thiết bị (HMAC 2 lớp) | ✅ Đã có |
| Phân quyền người dùng (RBAC: admin/operator) | ✅ Đã có |
| Nút cảm biến IoT (DHT22 — nhiệt độ, độ ẩm) | ✅ Đã có |
| Nút điều khiển thiết bị (đèn, quạt) | 🔜 Chưa làm |
| Mã hóa MQTT bằng TLS | 🔜 Chưa làm |
| Module AI học thói quen / dự đoán hành vi | 🔜 Chưa làm |

---

## Table of Contents

- [Đề Tài](#đề-tài)
- [Architecture](#architecture)
- [Tech Stack](#tech-stack)
- [Quick Start — Docker](#quick-start--docker)
- [Local Development](#local-development)
- [Firmware Setup (ESP32)](#firmware-setup-esp32)
- [API Reference](#api-reference)
- [Environment Variables](#environment-variables)
- [Database Schema](#database-schema)
- [Security Model](#security-model)
- [Project Structure](#project-structure)
- [Documentation](#documentation)
- [License](#license)

---

## Architecture

### Data Flow

```
┌─────────────────────────────────────────────────────────────────────┐
│  FIRMWARE LAYER (C++ / PlatformIO)                                   │
│                                                                       │
│  [ESP32 Sensor Node]              [ESP32 Gateway Node]                │
│  ┌─────────────────┐              ┌──────────────────────────┐        │
│  │ Read DHT22      │              │ Subscribe Broker 1 :1883 │        │
│  │ Compute         │──MQTT 1883──▶│ Verify Sensor HMAC       │        │
│  │ HMAC-SHA256     │              │ (offline, constant-time) │        │
│  │ Publish payload │              │ Sign Gateway HMAC        │        │
│  └─────────────────┘              │ Publish → Broker 2 :1884 │        │
│                                   └──────────────────────────┘        │
└──────────────────────────────────────────┬────────────────────────────┘
                                           │ MQTT gateway/{id}/data
                                           ▼
┌─────────────────────────────────────────────────────────────────────┐
│  INFRASTRUCTURE LAYER (Docker Compose — 6 services)                  │
│                                                                       │
│  [Mosquitto Broker 1 :1883]  ─────── Sensor ↔ Gateway only          │
│  [Mosquitto Broker 2 :1884]  ─────── Gateway → Backend only         │
│                                           │                           │
│  [Nginx :80] ──/api/*──▶ [Backend Express :5000] ──▶ [MySQL :3306]  │
│              ──/*──────▶ [Next.js Frontend :3000]                    │
└─────────────────────────────────────────────────────────────────────┘
```

**Why two separate MQTT brokers?**
- **Broker 1 (`:1883`)** — LAN-local. Sensors and Gateway share this network. If Broker 1 is compromised, forged data still cannot reach the backend because the Gateway validates HMAC before forwarding.
- **Broker 2 (`:1884`)** — Only Gateway-authenticated traffic arrives here. Backend trusts nothing on Broker 2 either — it re-validates both signatures independently.

### Authentication Chain

```
Sensor signs     →  Gateway verifies (offline)  →  Gateway signs  →  Backend verifies both
HMAC#1 (sensor)      + forwards enc. payload       HMAC#2 (gw)       HMAC#2 + HMAC#1 (DB)
```

7 independent checkpoints before a data point reaches `sensor_data`:
**sensor whitelist → timestamp (gateway) → HMAC sensor (gateway) → HMAC gateway (backend) → HMAC sensor (backend) → device_type → status**

---

## Tech Stack

| Layer | Technology |
|-------|------------|
| **Frontend** | Next.js 16, React 19, TailwindCSS v4, Recharts, SWR |
| **Backend** | Node.js 20, Express 5, TypeScript, mysql2, mqtt.js |
| **Database** | MySQL 8.0 |
| **Message Broker** | Eclipse Mosquitto 2 (×2 independent instances) |
| **Security** | HMAC-SHA256 (mbedTLS on firmware, Node.js crypto on backend), bcrypt (cost 12), JWT HttpOnly cookie, Helmet, express-rate-limit |
| **Firmware** | C++ / PlatformIO, ESP32 DOIT DevKit V1, DHT22 |
| **Infrastructure** | Docker Compose, Nginx Alpine |

---

## Quick Start — Docker

### Prerequisites

- [Docker Desktop](https://www.docker.com/products/docker-desktop) ≥ 24.x (running)
- Free ports: `80`, `3000`, `5000`, `1883`, `1884`, `3308`

### Step 1 — Environment file

```bash
# Windows (PowerShell)
Copy-Item backend\.env.example backend\.env

# Linux / macOS / WSL
cp backend/.env.example backend/.env
```

Default `backend/.env` for Docker:

```env
PORT=5000
DB_HOST=mysql
DB_PORT=3306
DB_USER=iot_managerIoT
DB_PASS=iot_managerIoTpassword
DB_NAME=iot_managerDeviceIoT
JWT_SECRET=dev_secret_please_change_in_production_min32chars
MQTT_HOST=mqtt-broker-2
MQTT_PORT=1883
FRONTEND_URL=http://localhost
ADMIN_USERNAME=admin
ADMIN_PASSWORD=admin123
```

> **Note:** `DB_HOST=mysql` and `MQTT_HOST=mqtt-broker-2` are Docker-internal service names.

### Step 2 — Start the stack

**Automated (recommended):**

```bat
# Windows
scripts\setup.bat
```

```bash
# Linux / macOS / WSL
bash scripts/setup.sh
```

**Or manually:**

```bash
docker compose up -d --build
```

> First run takes 3–5 minutes for image pulls and builds. Subsequent starts are faster thanks to layer cache.

### Step 3 — Verify services

```bash
docker compose ps
```

All services should be `running` or `running (healthy)`:

```
NAME                 STATUS                  PORTS
iot-nginx            running                 0.0.0.0:80->80/tcp
iot-frontend         running                 0.0.0.0:3000->3000/tcp
iot-backend          running (healthy)       0.0.0.0:5000->5000/tcp
iot-mqtt-broker-1    running                 0.0.0.0:1883->1883/tcp
iot-mqtt-broker-2    running                 0.0.0.0:1884->1883/tcp
iot-mysql            running (healthy)       0.0.0.0:3308->3306/tcp
```

### Step 4 — Access

| Service | URL |
|---------|-----|
| **Dashboard** (via Nginx) | http://localhost |
| **Dashboard** (direct) | http://localhost:3000 |
| **Backend API** | http://localhost:5000 |
| **Health check** | http://localhost:5000/api/health |
| **MQTT Broker 1** | `mqtt://localhost:1883` |
| **MQTT Broker 2** | `mqtt://localhost:1884` |

**Default credentials:**

| Field | Value |
|-------|-------|
| Username | `admin` |
| Password | `admin123` |

```bash
# Quick health check
curl http://localhost:5000/api/health
# → { "status": "ok", "message": "Backend running" }
```

### Common Docker commands

```bash
docker compose logs -f backend          # Stream backend logs
docker compose restart backend          # Restart a service
docker compose down                     # Stop (data preserved)
docker compose down -v                  # Stop + wipe all data
docker compose up -d --build backend    # Rebuild after code change

# Production build
docker compose -f docker-compose.prod.yml up -d --build
```

---

## Local Development

### Prerequisites

- Node.js ≥ 20, npm ≥ 10
- MySQL 8.0
- Mosquitto MQTT Broker (2 instances on ports 1883 and 1884)

**Tip:** Run only the infrastructure in Docker, backends locally:

```bash
docker compose up -d mysql mqtt-broker-1 mqtt-broker-2
```

### Backend

```bash
cd backend
cp .env.example .env
# Edit .env: DB_HOST=localhost, MQTT_HOST=localhost, MQTT_PORT=1884
npm install
npm run dev
# API at http://localhost:5000
```

### Frontend

```bash
cd frontend
npm install
npm run dev
# Dashboard at http://localhost:3000
```

---

## Firmware Setup (ESP32)

> **Required order:** Register devices on the Dashboard first → Flash Sensor → Flash Gateway.
> The Gateway needs each Sensor's `device_id` and `secret_key` to build its local authentication whitelist.

### Hardware Requirements

| Component | Qty | Notes |
|-----------|-----|-------|
| ESP32 DOIT DevKit V1 (30-pin) | 2 | 1 Gateway + 1+ Sensors |
| DHT22 sensor (AM2302) | 1 per sensor node | Temperature & humidity |
| 10 kΩ resistor | 1 per DHT22 | Pull-up on DATA pin — **required** |
| Jumper wires | Several | |
| Micro-B USB cable (data) | 2 | Charge-only cables will not flash |

### DHT22 → ESP32 Wiring

```
ESP32 (DOIT V1)              DHT22 (AM2302)
─────────────────────────────────────────────────
3V3  ──────────────────────  Pin 1 (VCC)
GPIO4  ──┬─────────────────  Pin 2 (DATA)
         │
        10 kΩ  (DATA → 3V3)
         │
3V3  ────┘
GND  ──────────────────────  Pin 4 (GND)
                             Pin 3: N/C
```

### PlatformIO

Firmware uses **PlatformIO**, not the standard Arduino IDE.

- **Recommended:** Install the [PlatformIO IDE](https://platformio.org/install/ide?install=vscode) extension in VS Code
- **CLI:** `pip install platformio` (Python ≥ 3.8)

Restart VS Code after installation. PlatformIO auto-detects `platformio.ini` when you open a firmware directory.

---

### Step 1 — Determine host IP

ESP32 boards need the IP of the machine running Docker.

```bash
# Windows
ipconfig
# → Find "IPv4 Address" for your active WiFi adapter (e.g. 192.168.1.100)

# Linux
ip addr show | grep "inet " | grep -v 127.0.0.1

# macOS
ipconfig getifaddr en0
```

> All ESP32 boards and the host machine must be on the **same 2.4 GHz WiFi network**.

### Step 2 — Register devices on the Dashboard

1. Open **http://localhost** → log in (`admin` / `admin123`)
2. Go to **Devices** → click **"Add Device"**
3. Register **Gateway Node**: enter a name, select type = `gateway` → Save → **copy `device_id` and `secret_key` immediately**
4. Register **Sensor Node**: enter a name, select type = `sensor` → Save → **copy `device_id` and `secret_key` immediately**

> `secret_key` is a 64-character hex string returned **only once** at registration time. Store it immediately.

### Step 3 — Flash Sensor Node

Edit `firmware/sensor-node/include/config.h`:

```cpp
// Device credentials (from Step 2)
#define DEVICE_ID   "ESP32-SN-XXXXXXXX"
#define SECRET_KEY  "abcdef1234...."       // 64-char hex

// WiFi (2.4 GHz only)
#define WIFI_SSID   "YourSSID"
#define WIFI_PASS   "YourPassword"

// MQTT Broker 1 (host IP from Step 1)
#define MQTT_HOST   "192.168.1.100"
#define MQTT_PORT   1883

// DHT22 sensor
#define DHT_PIN        4
#define DHT_TYPE       DHT22
#define SEND_INTERVAL  5000               // publish every 5 s
```

```bash
cd firmware/sensor-node
pio run --target upload
```

**Expected Serial Monitor output (115200 baud):**

```
[WiFi] Connected — IP: 192.168.1.105
[NTP]  Sync OK
[MQTT] Connected to 192.168.1.100:1883
[MQTT] Published → local/sensors/ESP32-SN-XXXXXXXX/data
```

### Step 4 — Flash Gateway Node

Edit `firmware/gateway-node/include/config_gw.h`:

```cpp
// Gateway credentials (from Step 2)
#define GW_DEVICE_ID   "ESP32-GW-XXXXXXXX"
#define GW_SECRET_KEY  "abcdef1234...."

// WiFi
#define WIFI_SSID   "YourSSID"
#define WIFI_PASS   "YourPassword"

// MQTT Broker 1 — subscribe sensor data
#define MQTT_BROKER1_HOST  "192.168.1.100"
#define MQTT_BROKER1_PORT  1883

// MQTT Broker 2 — publish to backend
#define MQTT_BROKER2_HOST  "192.168.1.100"
#define MQTT_BROKER2_PORT  1884

// Backend URL to fetch sensor list every 5 min
#define BACKEND_SENSORS_URL  "http://192.168.1.100/api/device/sensors"

// Local sensor whitelist (backup before first backend fetch)
static const SensorCredential KNOWN_SENSORS[] = {
    { "ESP32-SN-XXXXXXXX", "secret_key_64_chars_hex" },
};
```

```bash
cd firmware/gateway-node
pio run --target upload
```

**Expected Serial Monitor output:**

```
[WiFi]     Connected
[NTP]      Sync OK
[MQTT-SUB] Broker 1: 192.168.1.100:1883 → OK
[MQTT-SUB] Subscribed: local/sensors/+/data
[MQTT-PUB] Broker 2: 192.168.1.100:1884 → OK
[Registry] Sensor list fetched from backend
[MAIN]     Ready — listening for sensor data...
```

### Step 5 — Activate devices

Devices start as `inactive`. Activate them:

1. Open **http://localhost/devices**
2. Find Gateway and Sensor
3. Click **"Activate"** on each (sets `status = active`)

> Devices with `inactive` or `blocked` status are **silently rejected** by the backend.

### Step 6 — Verify on Dashboard

Open **http://localhost** → **Dashboard**:

- Temperature / humidity chart updates every ~5 s
- Device status shows **Online** (`last_seen < 60 s`)
- `/audit` page shows new `DATA_RECV` events

---

## API Reference

All endpoints except `/api/health` and `/api/auth/login` require a valid JWT in the `token` HttpOnly cookie.

### Authentication

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| `POST` | `/api/auth/login` | Public (10 req/15 min) | Sign in, sets HttpOnly cookie |
| `POST` | `/api/auth/logout` | JWT | Clear cookie |
| `GET` | `/api/auth/me` | JWT | Current user info |

```json
// POST /api/auth/login — body
{ "username": "admin", "password": "admin123" }
```

### Devices

| Method | Endpoint | Role | Description |
|--------|----------|------|-------------|
| `POST` | `/api/devices/register` | admin, operator | Register new device |
| `GET` | `/api/devices` | any | Device list + online status |
| `GET` | `/api/devices/:id` | any | Device detail + last 10 readings |
| `GET` | `/api/devices/:id/data` | any | Paginated sensor history (`?page=1&limit=20`) |
| `PATCH` | `/api/devices/:id/status` | admin, operator | Change status: `active` / `inactive` / `blocked` |
| `DELETE` | `/api/devices/:id` | admin | Delete device and all associated data |

```json
// POST /api/devices/register — body
{
  "device_name": "Living Room Sensor",
  "device_type": "sensor",
  "location": "Ground floor"
}

// Response 201
{
  "success": true,
  "device": {
    "device_id": "ESP32-SN-A1B2C3D4",
    "device_type": "sensor",
    "status": "inactive",
    "secret_key": "<64-char-hex — returned once only>"
  }
}
```

### Device Data (Firmware)

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| `GET` | `/api/device/sensors` | Gateway HMAC | Gateway fetches active sensor list (cached 5 min) |
| `POST` | `/api/device/data` | HMAC (60 req/min) | HTTP fallback for sensor data (testing only) |

> Primary path: Gateway sends data over **MQTT** (`gateway/{gw_id}/data`). HTTP endpoint exists as fallback.

### Dashboard

| Method | Endpoint | Role | Description |
|--------|----------|------|-------------|
| `GET` | `/api/dashboard/stats` | any | Summary statistics |

```json
// GET /api/dashboard/stats — response
{
  "total_gateway": 1,
  "total_sensor": 2,
  "gateway_online": 1,
  "sensor_online": 2,
  "total_data_points": 1500
}
```

### Users (Admin only)

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/users` | List all users |
| `POST` | `/api/users` | Create user (`operator`) |
| `PATCH` | `/api/users/:id/password` | Reset password |
| `DELETE` | `/api/users/:id` | Delete user |

### Audit Log

| Method | Endpoint | Role | Description |
|--------|----------|------|-------------|
| `GET` | `/api/audit-log` | any | Security event log (max 500, role-filtered) |
| `DELETE` | `/api/audit-log/data-recv` | admin | Purge DATA_RECV entries |
| `DELETE` | `/api/audit-log/by-type` | admin | Purge by event type |
| `DELETE` | `/api/audit-log/bulk` | admin | Bulk delete by ID |

**Query parameters:** `event_type`, `device_id`, `from`, `to`

**Event types:**

| Event | Description |
|-------|-------------|
| `DATA_RECV` | Sensor data accepted and stored |
| `DEVICE_REGISTER` | New device registered |
| `DEVICE_BLOCKED` | Device auto-blocked after 5 failures |
| `DEVICE_STATUS_CHANGE` | Status changed by admin/operator |
| `DEVICE_DELETE` | Device deleted |
| `GATEWAY_AUTH_FAIL` | Gateway HMAC verification failed |
| `SENSOR_AUTH_FAIL` | Sensor HMAC verification failed |
| `REPLAY_ATTACK` | Timestamp outside ±300 s window |
| `PRIVILEGE_ESCALATION` | Unauthorized role access attempt |
| `LOGIN` | Successful user login |

---

## Environment Variables

### `backend/.env`

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `5000` | Backend listen port |
| `DB_HOST` | `localhost` | MySQL host (`mysql` in Docker) |
| `DB_PORT` | `3306` | MySQL internal port |
| `DB_USER` | `iot_managerIoT` | MySQL username |
| `DB_PASS` | `iot_managerIoTpassword` | MySQL password |
| `DB_NAME` | `iot_managerDeviceIoT` | Database name |
| `JWT_SECRET` | — | JWT signing key **(required, min 32 chars)** |
| `MQTT_HOST` | `localhost` | Broker 2 host (`mqtt-broker-2` in Docker) |
| `MQTT_PORT` | `1884` | Broker 2 port (Docker internal: `1883`) |
| `FRONTEND_URL` | `http://localhost` | Frontend origin for CORS |
| `ADMIN_USERNAME` | `admin` | Seeded admin username |
| `ADMIN_PASSWORD` | `admin123` | Seeded admin password |

> `.env` is excluded from git. **Never commit credentials.**
> In production: rotate `JWT_SECRET` (use `openssl rand -hex 32`), change `ADMIN_PASSWORD`.

---

## Database Schema

```
users         — Login accounts (admin / operator)
devices       — IoT device registry (gateway / sensor)
sensor_data   — Sensor readings (JSON payload, max 150/device)
device_tokens — Token revocation tracking
audit_log     — Immutable security event log
```

### `devices`

| Column | Type | Description |
|--------|------|-------------|
| `id` | INT PK | Auto-increment |
| `device_id` | VARCHAR UNIQUE | Unique device identifier (`ESP32-SN-XXXXXXXX`) |
| `device_name` | VARCHAR | Display name |
| `device_type` | ENUM | `gateway` or `sensor` |
| `secret_key` | VARCHAR(64) | HMAC signing key (hex, never exposed after registration) |
| `status` | ENUM | `inactive` / `active` / `blocked` |
| `location` | VARCHAR | Physical location |
| `fail_count` | INT | Consecutive auth failures (auto-block at 5) |
| `last_seen` | DATETIME | Last successful data reception |
| `last_ip` | VARCHAR | Last seen IP address |
| `created_by` | INT FK | User who registered the device |

### `sensor_data`

| Column | Type | Description |
|--------|------|-------------|
| `id` | INT PK | Auto-increment |
| `device_id` | INT FK | Sensor device |
| `gateway_id` | INT FK | Gateway that forwarded the reading |
| `payload` | JSON | `{ "temperature": 28.5, "humidity": 65.2 }` |
| `received_at` | DATETIME | Backend reception timestamp |

> Auto-pruned: keeps the **150 most recent records per device** after each insert.

---

## Security Model

### Two-Layer HMAC

```
HMAC-SHA256(secret_key, "device_id:unix_timestamp")
```

| Layer | Signed by | Verified by | Mode |
|-------|-----------|-------------|------|
| **Layer 1 — Sensor** | Sensor firmware | Gateway (offline, no backend) | `safeEq64()` constant-time |
| **Layer 2 — Gateway** | Gateway firmware | Backend (from DB secret) | `crypto.timingSafeEqual()` |

Both signatures are independently re-verified by the backend regardless of what the gateway claims.

**Anti-abuse mechanisms:**

| Mechanism | Detail |
|-----------|--------|
| Replay protection | Timestamp must be within ±300 s (enforced at gateway AND backend independently) |
| Timing attack prevention | Constant-time comparison in both firmware (`safeEq64`) and backend (`timingSafeEqual`) |
| Brute-force protection | Auto-block after 5 consecutive failures; `fail_count` resets on success |
| User enumeration prevention | Dummy bcrypt comparison on unknown username (constant response time) |

### RBAC Roles

| Permission | `admin` | `operator` |
|------------|:-------:|:----------:|
| View dashboard & data | ✅ | ✅ |
| Register / activate devices | ✅ | ✅ |
| Block / delete devices | ✅ | Block only |
| View audit log | ✅ | ✅ |
| Purge audit log | ✅ | — |
| Manage users | ✅ | — |

### Rate Limiting

| Endpoint group | Limit |
|----------------|-------|
| Auth endpoints | 10 req / 15 min |
| Device data (firmware) | 60 req / min |
| General API | 100 req / 15 min |

---

## Project Structure

```
secure-smart-home-iot/
├── frontend/                  Next.js 16 + React 19 + TailwindCSS v4    → :3000
├── backend/                   Express 5 + TypeScript + MySQL             → :5000
├── firmware/
│   ├── sensor-node/           ESP32: DHT22 reader + HMAC publisher
│   ├── sensor-node-2/         ESP32: second sensor node
│   └── gateway-node/          ESP32: dual-broker bridge + local HMAC verifier
├── database/
│   └── migrations/            001_schema.sql — MySQL 8.0
├── mosquitto/
│   ├── broker1/               MQTT Broker 1 (Sensor ↔ Gateway)          → :1883
│   └── broker2/               MQTT Broker 2 (Gateway → Backend)         → :1884
├── nginx/                     Reverse proxy config                       → :80
├── scripts/
│   ├── setup.bat              Windows automated setup
│   └── setup.sh               Linux / macOS / WSL automated setup
├── docs/                      14 technical documentation files
├── docker-compose.yml         Development stack (6 services)
└── docker-compose.prod.yml    Production stack
```

---

## Documentation

Detailed technical documentation is in [`docs/`](docs/):

| File | Description |
|------|-------------|
| [`KIEN_TRUC_HE_THONG.md`](docs/KIEN_TRUC_HE_THONG.md) | Full system architecture |
| [`GIAO_TIEP_HE_THONG.md`](docs/GIAO_TIEP_HE_THONG.md) | Component handshake details (with code references) |
| [`BAO_MAT_TRIEN_KHAI.md`](docs/BAO_MAT_TRIEN_KHAI.md) | Security implementation deep dive |
| [`RBAC_CHI_TIET.md`](docs/RBAC_CHI_TIET.md) | RBAC role matrix and middleware flow |
| [`THREAT_MODEL_SECURITY-final.md`](docs/THREAT_MODEL_SECURITY-final.md) | STRIDE threat model |
| [`THREAT_MODEL_SECTION_3_3.md`](docs/THREAT_MODEL_SECTION_3_3.md) | Attack demo scenarios with real device output |
| [`KET_QUA_TRIEN_KHAI.md`](docs/KET_QUA_TRIEN_KHAI.md) | Deployment results & feature checklist |
| [`integration_test.md`](docs/integration_test.md) | Integration test checklist & attack scenarios |
| [`STATUS_CODES.md`](docs/STATUS_CODES.md) | API status codes reference |
| [`MQTT_DOCKER.md`](docs/MQTT_DOCKER.md) | MQTT broker configuration guide |
| [`CAU_HOI_PHAN_BIEN.md`](docs/CAU_HOI_PHAN_BIEN.md) | Technical Q&A — design decisions explained |

---

## License

This project is licensed under the [MIT License](LICENSE).

Copyright © 2026 Nguyễn Hoàng Đạt
