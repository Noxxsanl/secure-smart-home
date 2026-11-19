<div align="center">

# Secure Smart Home IoT System

**Full-stack IoT platform with multi-layer security: dual MQTT brokers, two-layer HMAC authentication, RBAC access control, and ESP32 firmware.**

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![Node.js](https://img.shields.io/badge/Node.js-20.x-green?logo=node.js)](https://nodejs.org)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.x-blue?logo=typescript)](https://typescriptlang.org)
[![Next.js](https://img.shields.io/badge/Next.js-16-black?logo=next.js)](https://nextjs.org)
[![Docker](https://img.shields.io/badge/Docker-Compose-2496ED?logo=docker)](https://docker.com)
[![ESP-IDF](https://img.shields.io/badge/ESP--IDF-5.4-orange?logo=espressif)](https://docs.espressif.com/projects/esp-idf/)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-16-4169E1?logo=postgresql&logoColor=white)](https://www.postgresql.org)

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
| Mã hóa MQTT bằng TLS | 🟡 Gateway ↔ Backend (TLS xác thực server) — mTLS, ACL theo gateway chưa làm |
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
│  FIRMWARE LAYER (C / ESP-IDF 5.4)                                    │
│                                                                       │
│  [ESP32 Sensor Node]              [ESP32 Gateway Node]                │
│  ┌─────────────────┐              ┌──────────────────────────┐        │
│  │ Read sensors    │              │ Receive ESP-NOW frames   │        │
│  │ Compute         │──ESP-NOW────▶│ Verify Sensor HMAC       │        │
│  │ HMAC-SHA256     │              │ (offline, constant-time) │        │
│  │ Send via ESP-NOW│              │ Sign Gateway HMAC        │        │
│  └─────────────────┘              │ Publish → broker :8883   │        │
│                                   └──────────────────────────┘        │
└──────────────────────────────────────────┬────────────────────────────┘
                                           │ MQTT over TLS gateway/{id}/data
                                           ▼
┌─────────────────────────────────────────────────────────────────────┐
│  INFRASTRUCTURE LAYER (Docker Compose — 8 services)                  │
│                                                                       │
│  [Mosquitto broker :8883]  ───────── Gateway ↔ Backend, TLS only     │
│                                           │                           │
│  [Nginx :80] ──/api/*──▶ [Backend Express :5000] ──▶ [PostgreSQL :5432] │
│              ──/*──────▶ [Next.js Frontend :3000]                    │
└─────────────────────────────────────────────────────────────────────┘
```

**One MQTT broker (`:8883`, TLS only).** Sensor nodes reach the Gateway over ESP-NOW, so there is no MQTT on that hop. Only Gateway-authenticated traffic arrives here, encrypted with TLS ≥ 1.2; Gateway and Backend both verify the broker certificate against the local CA. Backend trusts nothing on the broker either — it re-validates both signatures independently.

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
| **Backend** | Node.js 20, Express 5, TypeScript, pg (hand-written SQL, no ORM), mqtt.js |
| **Database** | PostgreSQL 16 |
| **Message Broker** | Eclipse Mosquitto 2 (×2 independent instances) |
| **Security** | HMAC-SHA256 (mbedTLS on firmware, Node.js crypto on backend), bcrypt (cost 12), JWT HttpOnly cookie, Helmet, express-rate-limit |
| **Firmware** | C / ESP-IDF 5.4 — ESP32-S3 Gateway + Node (ESP-NOW), ESP32-CAM |
| **Infrastructure** | Docker Compose, Nginx Alpine |

---

## Quick Start — Docker

### Prerequisites

- [Docker Desktop](https://www.docker.com/products/docker-desktop) ≥ 24.x (running)
- Free ports: `80`, `443`, `3001`–`3003`, `5000`, `8883`, `5433`
- `openssl` (bundled with Git Bash on Windows) to generate the MQTT TLS certificates

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
DB_HOST=postgres
DB_PORT=5432
DB_USER=secure_smart_home_app
DB_PASS=change_me
DB_NAME=secure_smart_home_iot
JWT_SECRET=dev_secret_please_change_in_production_min32chars
MQTT_HOST=mqtt-broker
MQTT_PORT=8883
FRONTEND_URL=http://localhost
ADMIN_USERNAME=admin
ADMIN_PASSWORD=admin123
```

> **Note:** `DB_HOST=postgres` and `MQTT_HOST=mqtt-broker` are Docker-internal service names.

**PostgreSQL credentials for Docker** live in the root `.env` (gitignored), read by both compose files. `scripts/setup.sh` / `setup.bat` generate it with random passwords; to create it by hand:

```bash
cp .env.example .env   # then set POSTGRES_PASSWORD and POSTGRES_APP_PASSWORD
```

In Docker, compose injects `DB_USER` / `DB_PASS` / `DB_NAME` into the backend from this file, overriding `backend/.env`. `docker compose up` refuses to start if `POSTGRES_PASSWORD` or `POSTGRES_APP_PASSWORD` is missing. On first start (empty `pg_data` volume) `infra/postgres/init/00_init.sh` creates the non-superuser app role (`POSTGRES_APP_USER`) and applies `infra/postgres/migrations/001_schema.sql` as that role. PostgreSQL is published only on `127.0.0.1:5433` (container port 5432).

> **Migrated from MySQL (2026-10-27):** the database moved from MySQL 8 to PostgreSQL 16. Old data is **not** migrated (reset; demo data is re-seeded). The old `mysql_data` volume is left untouched and no longer used.

### Step 1b — MQTT TLS certificates

Broker MQTT only accepts MQTT over TLS. Generate a local CA and the broker certificate once, passing the LAN IP the Gateway will use (NVS `cloud/mqtt_uri`):

```bash
bash infra/pki/gen_mqtt_certs.sh 192.168.1.100
```

This writes `infra/mosquitto/certs/` (gitignored) and copies `ca.crt` to the gateway project's `certs/mqtt_ca.crt`. If the LAN IP changes, run it again — the CA is reused, so the Gateway does not need reflashing. Verify with `bash tests/security/check_mqtt_tls.sh`.

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
docker compose up -d --build --renew-anon-volumes   # or: make dev (foreground)
```

> `--renew-anon-volumes` (`-V`) refreshes the anonymous `node_modules` volumes from the freshly built images. Without it Compose reuses the old volumes when recreating containers, so new/renamed workspace packages (e.g. `@shh/*` in `frontend/`) are missing at runtime.
>
> First run takes 3–5 minutes for image pulls and builds. Subsequent starts are faster thanks to layer cache.

### Step 3 — Verify services

```bash
docker compose ps
```

All services should be `running` or `running (healthy)`:

```
NAME                 STATUS                  PORTS
iot-nginx              running                 0.0.0.0:80->80/tcp
iot-frontend-admin     running                 0.0.0.0:3001->3000/tcp
iot-frontend-operator  running                 0.0.0.0:3002->3000/tcp
iot-frontend-user      running                 0.0.0.0:3003->3000/tcp
iot-backend            running                 0.0.0.0:5000->5000/tcp
iot-mosquitto          running                 0.0.0.0:8883->8883/tcp
iot-postgres           running (healthy)       127.0.0.1:5433->5432/tcp
```

### Step 4 — Access

| Service | URL |
|---------|-----|
| **Admin console** (via Nginx) | http://localhost or http://admin.localhost |
| **Operator console** (via Nginx) | http://operator.localhost |
| **Customer portal** (via Nginx) | http://user.localhost |
| **Apps** (direct, dev) | http://localhost:3001 · :3002 · :3003 |
| **Backend API** | http://localhost:5000 |
| **Health check** | http://localhost:5000/api/health |
| **MQTT broker** | `mqtts://localhost:8883` (CA: `infra/mosquitto/certs/ca.crt`) |

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
docker compose up -d --build -V frontend-admin   # Rebuild after dependency change (fresh node_modules volume)

# Production build
docker compose -f compose.prod.yaml up -d --build
```

---

## Local Development

### Prerequisites

- Node.js ≥ 20, npm ≥ 10
- PostgreSQL 16
- Mosquitto MQTT broker (8883 TLS only — certificates from `infra/pki/gen_mqtt_certs.sh`)

**Tip:** Run only the infrastructure in Docker, backends locally:

```bash
docker compose up -d postgres mqtt-broker
```

The compose file publishes PostgreSQL on `127.0.0.1:5433`, so the locally running backend uses `DB_HOST=localhost` and `DB_PORT=5433`. Without Docker, apply the schema by hand:

```bash
psql -v ON_ERROR_STOP=1 -U <app_user> -d secure_smart_home_iot -f infra/postgres/migrations/001_schema.sql
```

### Backend

```bash
cd backend
cp .env.example .env
# Edit .env: DB_HOST=localhost, MQTT_HOST=localhost, MQTT_PORT=8883
# (MQTT_CA_FILE defaults to ../infra/mosquitto/certs/ca.crt)
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

Firmware is built with **ESP-IDF 5.4** (the old PlatformIO `sensor-node` / `gateway-node` projects were removed).
Nodes talk to the Gateway over **ESP-NOW** (no MQTT, no broker on that hop); only the Gateway connects to the
MQTT broker, over TLS on `:8883`.

| Project | Board |
|---------|-------|
| `firmware/ESP32-S3-Touch-LCD-4.3B-BOX-Demo/ESP-IDF/08_lvgl_Porting` | Gateway — Waveshare ESP32-S3-Touch-LCD-4.3B-BOX |
| `firmware/esp32_s3_firmware_node` | Room node (ESP-NOW → Gateway) |
| `firmware/esp32_cam` | ESP32-CAM (snapshots → Gateway) |

- Build: [docs/guides/ESP_IDF_BUILD.md](docs/guides/ESP_IDF_BUILD.md)
- Real hardware → Server → web/mobile (cert for the LAN IP, `npm run hw:register`, NVS `cloud/*`): [docs/guides/LEN_SERVER.md](docs/guides/LEN_SERVER.md)

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
| `DB_HOST` | `localhost` | PostgreSQL host (`postgres` in Docker) |
| `DB_PORT` | `5433` | PostgreSQL port (host-published dev port; `5432` inside Docker) |
| `DB_USER` | `secure_smart_home_app` | PostgreSQL username (non-superuser app role) |
| `DB_PASS` | — (bắt buộc, không có mặc định) | PostgreSQL password |
| `DB_NAME` | `secure_smart_home_iot` | Database name |
| `JWT_SECRET` | — | JWT signing key **(required, min 32 chars)** |
| `MQTT_HOST` | `localhost` | Broker MQTT host (`mqtt-broker` in Docker) |
| `MQTT_PORT` | `8883` | Broker MQTT TLS port |
| `MQTT_CA_FILE` | `../infra/mosquitto/certs/ca.crt` | CA used to verify Broker MQTT (`/certs/mqtt-ca.crt` in Docker) |
| `FRONTEND_URL` | `http://localhost` | Frontend origin for CORS |
| `ADMIN_USERNAME` | `admin` | Admin username for `npm run seed` |
| `ADMIN_PASSWORD` | — | Admin password for `npm run seed` **(required; ≥ 12 chars in production)** |

> `.env` is excluded from git. **Never commit credentials.**
> The schema seeds no accounts. In development the demo seed (`SEED_DEMO_DATA`) creates `admin` / `admin123`. In production create the admin with `docker compose exec backend npm run seed` (reads `ADMIN_USERNAME`/`ADMIN_PASSWORD`), and rotate `JWT_SECRET` (use `openssl rand -hex 32`).

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
| `id` | INT PK | Identity (`GENERATED BY DEFAULT AS IDENTITY`) |
| `device_id` | VARCHAR UNIQUE | Unique device identifier (`ESP32-SN-XXXXXXXX`) |
| `device_name` | VARCHAR | Display name |
| `device_type` | VARCHAR + CHECK | `gateway` or `sensor` |
| `secret_key` | VARCHAR(64) | HMAC signing key (hex, never exposed after registration) |
| `status` | VARCHAR + CHECK | `inactive` / `active` / `blocked` |
| `location` | VARCHAR | Physical location |
| `fail_count` | INT | Consecutive auth failures (auto-block at 5) |
| `last_seen` | TIMESTAMPTZ | Last successful data reception |
| `last_ip` | VARCHAR | Last seen IP address |
| `created_by` | INT FK | User who registered the device |

### `sensor_data`

| Column | Type | Description |
|--------|------|-------------|
| `id` | INT PK | Identity |
| `device_id` | INT FK | Sensor device |
| `gateway_id` | INT FK | Gateway that forwarded the reading |
| `payload` | JSONB | `{ "temperature": 28.5, "humidity": 65.2 }` |
| `received_at` | TIMESTAMPTZ | Backend reception timestamp |

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
├── contracts/                 Protocol definitions (placeholders for now)
│   ├── asyncapi.yaml          MQTT topics, both hops
│   ├── datapoints.yaml        Shared datapoint model
│   └── openapi.json           REST API (to be generated from the backend)
├── backend/                   Express 5 + TypeScript + PostgreSQL (pg)   → :5000
├── frontend/                  Next.js 16 monorepo: admin / operator / user → :3001 / :3002 / :3003
├── mobile/                    Flutter app for customers
├── agent/                     AI Agent (empty — proposal pending approval)
├── firmware/
│   ├── ESP32-S3-Touch-LCD-4.3B-BOX-Demo/  Gateway (ESP-IDF, ESP-NOW ↔ MQTT TLS bridge + HMAC verifier)
│   ├── esp32_s3_firmware_node/            Room node (ESP-IDF, ESP-NOW)
│   └── esp32_cam/                         ESP32-CAM
├── infra/
│   ├── postgres/              init/00_init.sh (app role) + migrations/001_schema.sql (PostgreSQL 16 baseline)
│   ├── mosquitto/             mosquitto.conf (single broker, :8883 TLS only, Gateway ↔ Backend),
│   │                          certs/ (gitignored, only .gitkeep is committed)
│   ├── nginx/                 Reverse proxy config                       → :80
│   ├── pki/                   gen_mqtt_certs.sh — local CA + Broker MQTT TLS certificate
│   └── media/                 Camera media server (empty)
├── tests/
│   ├── security/              attack_demo*.sh, check_mqtt_tls.sh (FR-12.3), attack/demo guides
│   ├── performance/           (empty)
│   ├── kws/                   (empty)
│   └── e2e/                   (empty)
├── scripts/                   setup.sh (Linux/macOS/WSL), setup.bat (Windows)
├── docs/                      16 technical docs (general at root; architecture/, firmware/, guides/, proposals/)
├── compose.yaml               Base stack (8 services; currently also holds the dev settings)
├── compose.override.yaml      Dev overrides, auto-loaded by `docker compose` (placeholder)
├── compose.prod.yaml          Production stack (`docker compose -f compose.prod.yaml …`)
└── Makefile                   make dev / prod / certs / migrate / test-security
```

---

## Documentation

Detailed technical documentation is in [`docs/`](docs/) (Vietnamese). `docs/` describes the **target architecture (V2)**; the code describes the current state.

**General (`docs/`)** — cross-cutting documents for the whole project:

| File | Description |
|------|-------------|
| [`SMART_HOME_PRODUCT_ARCHITECTURE.md`](docs/SMART_HOME_PRODUCT_ARCHITECTURE.md) | Product architecture, claim/activation, 2-level RBAC |
| [`SECURITY_ARCHITECTURE.md`](docs/SECURITY_ARCHITECTURE.md) | Security architecture, threat model, attack scenarios |
| [`SMART_HOME_PRODUCT_ROADMAP.md`](docs/SMART_HOME_PRODUCT_ROADMAP.md) | Product roadmap Prototype → V2 → V3 → Commercial |
| [`PRD_SMART_HOME.md`](docs/PRD_SMART_HOME.md) | **PRD V2** — one-page summary (§0), requirements FR/NFR, acceptance criteria |
| [`API_DESIGN.md`](docs/API_DESIGN.md) | All APIs, current and planned: REST (dashboard/portal/mobile), WebSocket, device HTTP, MQTT, gateway/camera local HTTP, ESP-NOW frames, HMAC strings |
| [`DESIGN_PATTERNS.md`](docs/DESIGN_PATTERNS.md) | Design patterns per layer (backend, web, mobile, firmware): in use, recommended, avoid; review checklist |

**Layer architecture (`docs/architecture/`)**:

| File | Description |
|------|-------------|
| [`BACKEND_REFACTOR_SMARTHOME.md`](docs/architecture/BACKEND_REFACTOR_SMARTHOME.md) | Backend modules, API (§9), MQTT topics (§10), AI-ready design (§18) |
| [`DATABASE_REFACTOR_SMARTHOME.md`](docs/architecture/DATABASE_REFACTOR_SMARTHOME.md) | Database schema, naming, partition/retention |
| [`FRONTEND_REFACTOR_SMARTHOME.md`](docs/architecture/FRONTEND_REFACTOR_SMARTHOME.md) | Admin/Operator dashboard design |
| [`MOBILE_APP_ARCHITECTURE.md`](docs/architecture/MOBILE_APP_ARCHITECTURE.md) | Flutter app architecture |

**Firmware (`docs/firmware/`)**:

| File | Description |
|------|-------------|
| [`SMART_HOME_WIFI_PROVISIONING.md`](docs/firmware/SMART_HOME_WIFI_PROVISIONING.md) | WiFi provisioning, Gateway ↔ Node pairing, key hierarchy |
| [`EMBEDDED_ARCHITECTURE_ESP_IDF.md`](docs/firmware/EMBEDDED_ARCHITECTURE_ESP_IDF.md) | Firmware architecture (ESP-IDF target) |
| [`IOT_NODE_NETWORK.md`](docs/firmware/IOT_NODE_NETWORK.md) | Demo IoT network: Waveshare ESP32-S3-Touch-LCD-4.3B-BOX gateway, ESP32-CAM, living-room node; protocol per hop |

**Guides & current state (`docs/guides/`)**:

| File | Description |
|------|-------------|
| [`CHAY_LOCAL.md`](docs/guides/CHAY_LOCAL.md) | Run locally without Docker |
| [`MQTT_TLS.md`](docs/guides/MQTT_TLS.md) | MQTT TLS implementation, verification and runbook |

**Proposals (`docs/proposals/`)** — not yet requirements:

| File | Description |
|------|-------------|
| [`DE_XUAT_AI_AGENT.md`](docs/proposals/DE_XUAT_AI_AGENT.md) | AI Agent change proposal (draft, pending approval) |

**Security test guides (`tests/security/`)** — used for the thesis defence, next to the attack scripts:

| File | Description |
|------|-------------|
| [`DEMO_THREAT_MODEL.md`](tests/security/DEMO_THREAT_MODEL.md) | Step-by-step demo of 11 attack scenarios and how the system reacts |
| [`ATTACK_SIMULATION_GUIDE.md`](tests/security/ATTACK_SIMULATION_GUIDE.md) | Run the attack simulation from scratch (Docker, backend, frontend, scripts) |
| [`LINUX_ATTACK_GUIDE.md`](tests/security/LINUX_ATTACK_GUIDE.md) | Attack from an Ubuntu VM against the Windows server |
| [`DEMO-CODEX.md`](tests/security/DEMO-CODEX.md) | Threat model and attack scenarios (short version) |

**Protocol contracts (`contracts/`)** — placeholders; until filled in, [`API_DESIGN.md`](docs/API_DESIGN.md) remains the source of truth.

---

## License

This project is licensed under the [MIT License](LICENSE).

Copyright © 2026 Nguyễn Hoàng Đạt
