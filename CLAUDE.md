# Secure Smart Home IoT

Đồ án tốt nghiệp đang chuyển từ **demo quản lý thiết bị IoT** (Prototype) sang **nền tảng Smart Home thương mại** (V2 = mục tiêu bảo vệ). `docs/` là nguồn sự thật cho **kiến trúc đích**, code là nguồn sự thật cho **hiện trạng** — khi lệch nhau, luôn nói rõ đang mô tả cái nào.

## Codebase

| Tầng | Thư mục | Stack | Trạng thái |
|---|---|---|---|
| Backend | `backend/src/` | Express 5, TypeScript strict, pg (SQL tay, không ORM), mqtt, JWT cookie, bcrypt | Chạy thật; cấu trúc `src/modules/<domain>` (xem `backend/src/modules/README.md`) với 3 kênh: `/api/dashboard` (cookie, ADMIN/OPERATOR), `/api/portal` (cookie `sh_user`, khách hàng web), `/api/mobile` (Bearer + refresh token). WebSocket `/api/mobile/ws`. Simulator thiết bị cho `is_simulated=1`, automation engine, gợi ý thói quen. Route cũ (`/api/auth`, `/api/devices`, …) giữ lại cho `tests/security/attack_demo*.sh` |
| Database | `infra/postgres/migrations/001_schema.sql`, `backend/src/config/migrate.ts` | PostgreSQL 16, UTC (chuyển từ MySQL 8 ngày 2026-10-27; `001_schema.sql` là baseline, `migrate.ts` append-only từ mảng rỗng) | Bảng gốc (`users`, `devices`, `sensor_data`, `device_tokens`, `audit_log`, `notifications`) + V2: `customers`, `smart_homes`, `rooms`, `smart_home_members`, `member_device_access`, `activation_tokens`, `activation_logs`, `refresh_tokens`, `device_commands`, `user_behavior_logs`, `automation_rules`, `automation_history`, `recommendation_history`, `user_feedback`, `operator_home_access`, `firmware`, `ota_jobs`, `ota_history` |
| Web (3 app) | `frontend/{admin,operator,user}/`, dùng chung `frontend/packages/{shared,console}` | Next.js **16.2.5**, React 19, Tailwind v4, SWR, npm workspaces | **Nối API thật** (client chung `packages/shared/api/http.ts`, rewrites `/api/*` → `BACKEND_URL`), trừ AI Dashboard và Admin Settings vẫn mock (`packages/shared/mock/`). Mỗi role hệ thống một app (:3001/:3002/:3003). App `user` là cổng web khách hàng — ngoài phạm vi PRD V2 (§2.2, FR-1.4), xem `frontend/README.md` |
| Mobile | `mobile/lib/` | Flutter, Riverpod, `http`, `flutter_secure_storage`, `web_socket_channel`, `mobile_scanner` | Cho khách hàng (USER); repository remote + mock (`--dart-define=USE_MOCK=true`, `API_BASE_URL`); 47 test |
| Firmware | `firmware/{gateway-node,sensor-node}` | PlatformIO + Arduino, `esp32doit-devkit-v1` | Chạy thật |
| Hạ tầng | `compose.yaml`, `infra/mosquitto/`, `infra/nginx/` | 2 broker Mosquitto (1883 plaintext, 8883 TLS), PostgreSQL host 5433 (init `infra/postgres/init/00_init.sh`, role app không superuser) | Broker 2 chỉ TLS (cert: `infra/pki/gen_mqtt_certs.sh`, gitignored `infra/mosquitto/certs/`); cả hai vẫn `allow_anonymous true`, chưa ACL |
| Demo tấn công | `tests/security/attack_demo*.sh` | bash + curl + openssl | Dùng khi bảo vệ |

Bố cục gốc (từ 2026-10-27): `infra/{postgres,mosquitto,nginx,pki,media}`, `tests/{security,performance,kws,e2e}`, `contracts/`, `compose.yaml` + `compose.override.yaml` (dev, tự nạp) + `compose.prod.yaml`, `Makefile` (`make dev|prod|certs|migrate|test-security`); `scripts/` chỉ còn `setup.sh`/`setup.bat`. **Bản tạm, chưa code nào đọc**: `contracts/{asyncapi.yaml,datapoints.yaml,openapi.json}` (hợp đồng thật vẫn ở `docs/API_DESIGN.md`), `compose.override.yaml` (`services: {}` — cấu hình dev vẫn nằm trong `compose.yaml`). **Thư mục rỗng**: `infra/media/`, `tests/{performance,kws,e2e}/`, `agent/`.

Luồng dữ liệu: Sensor —`local/sensors/+/data` (Broker 1)→ Gateway verify HMAC sensor, ký HMAC gateway —`gateway/<GW_ID>/data` (Broker 2, TLS)→ `backend/src/services/mqttDataService.ts` verify 2 lớp → `sensor_data`. Fallback HTTP `POST /api/device/data`.

## Tài liệu (`docs/`)

Tên file không đánh số; trong docs gọi bằng nhãn ngắn (PRD, Backend, Database, Bảo mật…). Phân loại:

- `docs/` (chung, xuyên dự án): `SMART_HOME_PRODUCT_ARCHITECTURE` — kiến trúc sản phẩm, RBAC, claim (§0.1 vì sao bỏ mô hình Device Manager) · `SECURITY_ARCHITECTURE` · `SMART_HOME_PRODUCT_ROADMAP` · `PRD_SMART_HOME` — **PRD** (§0 tóm tắt 1 trang, FR-x.y, NFR-*, tiêu chí nghiệm thu, §14 truy vết) · `DESIGN_PATTERNS` — pattern đang dùng / nên áp dụng / không nên cho backend, web, mobile, firmware + checklist review · `API_DESIGN` — mọi API hiện có + dự kiến: REST 3 kênh, WebSocket, `/api/device`, MQTT, API cục bộ gateway/camera, ESP-NOW; chuỗi ký HMAC
- `docs/architecture/` (thiết kế đích backend/web/mobile): `BACKEND_REFACTOR_SMARTHOME` (§9 API, §10 MQTT, §18 AI) · `DATABASE_REFACTOR_SMARTHOME` (§6 naming, §7 bảng) · `FRONTEND_REFACTOR_SMARTHOME` · `MOBILE_APP_ARCHITECTURE`
- `docs/firmware/` (thiết kế đích tầng nhúng): `EMBEDDED_ARCHITECTURE_ESP_IDF` · `SMART_HOME_WIFI_PROVISIONING` · `IOT_NODE_NETWORK` (phần cứng demo: Gateway Waveshare ESP32-S3-Touch-LCD-4.3B-BOX, ESP32-CAM, Node phòng khách; giao thức từng chặng)
- `docs/guides/` (hướng dẫn, hiện trạng): `CHAY_LOCAL` · `MQTT_TLS` (hiện trạng FR-12.3, cách chạy, việc còn thiếu)
- `docs/proposals/`: `DE_XUAT_AI_AGENT` (**draft chờ giảng viên duyệt** — chưa phải yêu cầu)

Hiện trạng + việc còn lại của web: `frontend/README.md`. PRD thắng Roadmap khi mâu thuẫn. (`00` phân tích, `06` tiến độ frontend, `12` brief — tên cũ có số, đã gộp/gỡ, xem lịch sử git.)

Domain đích: `Customer → SmartHome → Room → Device(Gateway|Node) → Sensor → Telemetry`. API tách theo kênh: `/api/dashboard/**` (cookie, ADMIN/OPERATOR), `/api/mobile/**` (JWT Bearer, USER), `/api/device/**` (HMAC). RBAC 2 tầng: role hệ thống quyết định kênh, role trong nhà (OWNER/CONTROLLER/VIEWER/GUEST) quyết định hành động.

## Bất biến — không bao giờ vi phạm

1. Secret thiết bị/gateway chỉ trả **1 lần** khi tạo; không hiển thị trên Dashboard.
2. Không log password, token, secret, WiFi password ở bất kỳ tầng nào.
3. Không đọc/in/commit `firmware/**/config_1.h|config_2.h|config_gw.h`, `backend/.env`, `frontend/.env.local`, `infra/mosquitto/certs/*.key`. Không tắt kiểm chứng TLS (`rejectUnauthorized: false`, `setInsecure()`).
4. `middleware/validateDevice.ts` (HTTP) và `services/mqttDataService.ts` (MQTT) phải giữ cùng logic xác thực.
5. HMAC `HMAC-SHA256(secret, "<device_id>:<unix_ts>")` hex thường phải khớp backend ↔ gateway ↔ sensor.
6. Dữ liệu theo nhà: nhà không thuộc quyền → **404**, sai role trong nhà → **403**.
7. Mobile không kết nối MQTT trực tiếp — qua WebSocket backend.
8. Gợi ý AI không bao giờ tự điều khiển thiết bị khi chưa được chấp nhận.
9. Ghi nhiều bảng (tạo nhà, claim) trong **1 transaction**.
10. UI tiếng Việt; lỗi hiển thị hướng dẫn, không mã thô.

## Quy trình multi-agent

Agent ở `.claude/agents/`, skill ở `.claude/skills/`. Với một yêu cầu PRD hoặc tính năng chạm ≥ 2 tầng, session chính điều phối:

1. **research** — tìm yêu cầu trong PRD/docs + hiện trạng code, bằng chứng `file:line`.
2. **plan** — chốt hợp đồng (API, MQTT topic/payload, bảng/cột) và chia việc theo agent. Trình kế hoạch cho user nếu chạm > 3 tầng hoặc đổi schema.
3. Hiện thực — song song khi đã có hợp đồng: **backend** (API + DB), **frontend** (Dashboard + Mobile), **embedded** (firmware), **coder** (việc nhỏ/xuyên tầng/docs).
4. **tester** + **reviewer** chạy song song. Finding Critical/High → giao lại agent tầng đó, tối đa 2 vòng.
5. Báo cáo user: FR đạt/chưa đạt, file đã đổi, lệnh kiểm tra + kết quả thật. Không commit nếu user chưa yêu cầu.

Prompt giao cho agent phải tự đủ (agent không thấy hội thoại): mục tiêu + FR-ID, tiêu chí nghiệm thu, hợp đồng, file được/không được sửa, doc tham chiếu.

## Lệnh kiểm tra

- Backend: `cd backend && npx tsc --noEmit`
- Frontend: `cd frontend && npm run typecheck && npm run lint` (`npm run build` khi đổi route/config)
- Mobile: `cd mobile && flutter analyze && flutter test` (47 test; chạy máy ảo: `--dart-define=API_BASE_URL=…` hoặc `USE_MOCK=true`, xem `docs/guides/CHAY_LOCAL.md`)
- Firmware: `pio run -d firmware/<node>`
- CI: `.github/workflows/ci.yml` chạy các lệnh trên (chỉ tầng có file đổi) + job "Bảo mật repo" chặn commit file bí mật và tắt TLS. Firmware build bằng `include/config_*.example.h` — thêm macro mới thì thêm vào file mẫu, không thì CI đỏ

Chưa có test tự động cho backend/frontend (mobile có 47 test) — không nói "tests pass" khi không có test nào chạy.
