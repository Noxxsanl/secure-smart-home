# Secure Smart Home IoT

Đồ án tốt nghiệp đang chuyển từ **demo quản lý thiết bị IoT** (Prototype) sang **nền tảng Smart Home thương mại** (V2 = mục tiêu bảo vệ). `docs/` là nguồn sự thật cho **kiến trúc đích**, code là nguồn sự thật cho **hiện trạng** — khi lệch nhau, luôn nói rõ đang mô tả cái nào.

## Codebase

| Tầng | Thư mục | Stack | Trạng thái |
|---|---|---|---|
| Backend | `backend/src/` | Express 5, TypeScript strict, mysql2, mqtt, JWT cookie, bcrypt | Chạy thật; cấu trúc `src/modules/<domain>` (xem `backend/src/modules/README.md`) với 3 kênh: `/api/dashboard` (cookie, ADMIN/OPERATOR), `/api/portal` (cookie `sh_user`, khách hàng web), `/api/mobile` (Bearer + refresh token). WebSocket `/api/mobile/ws`. Simulator thiết bị cho `is_simulated=1`, automation engine, gợi ý thói quen. Route cũ (`/api/auth`, `/api/devices`, …) giữ lại cho `scripts/attack_demo*.sh` |
| Database | `database/migrations/001_schema.sql`, `backend/src/config/migrate.ts` | MySQL 8, UTC | Bảng gốc (`users`, `devices`, `sensor_data`, `device_tokens`, `audit_log`, `notifications`) + V2: `customers`, `smart_homes`, `rooms`, `smart_home_members`, `member_device_access`, `activation_tokens`, `activation_logs`, `refresh_tokens`, `device_commands`, `user_behavior_logs`, `automation_rules`, `automation_history`, `recommendation_history`, `user_feedback`, `operator_home_access`, `firmware`, `ota_jobs`, `ota_history` |
| Web (3 app) | `frontend/{admin,operator,user}/`, dùng chung `frontend/packages/{shared,console}` | Next.js **16.2.5**, React 19, Tailwind v4, SWR, npm workspaces | **Nối API thật** (client chung `packages/shared/api/http.ts`, rewrites `/api/*` → `BACKEND_URL`), trừ AI Dashboard và Admin Settings vẫn mock (`packages/shared/mock/`). Mỗi role hệ thống một app (:3001/:3002/:3003). App `user` là cổng web khách hàng — ngoài phạm vi PRD V2 (§2.2, FR-1.4), xem `frontend/README.md` |
| Mobile | `mobile/lib/` | Flutter, Riverpod, `http`, `flutter_secure_storage`, `web_socket_channel`, `mobile_scanner` | Cho khách hàng (USER); repository remote + mock (`--dart-define=USE_MOCK=true`, `API_BASE_URL`); 47 test |
| Firmware | `firmware/{gateway-node,sensor-node,sensor-node-2}` | PlatformIO + Arduino, `esp32doit-devkit-v1` | Chạy thật. `firmware/ESP32-S3-Touch-LCD-7B` là vendor — không sửa |
| Hạ tầng | `docker-compose.yml`, `mosquitto/`, `nginx/` | 2 broker Mosquitto (1883 plaintext, 8883 TLS), MySQL host 3308 | Broker 2 chỉ TLS (cert: `scripts/gen_mqtt_certs.sh`, gitignored `mosquitto/certs/`); cả hai vẫn `allow_anonymous true`, chưa ACL |
| Demo tấn công | `scripts/attack_demo*.sh` | bash + curl + openssl | Dùng khi bảo vệ |

Luồng dữ liệu: Sensor —`local/sensors/+/data` (Broker 1)→ Gateway verify HMAC sensor, ký HMAC gateway —`gateway/<GW_ID>/data` (Broker 2, TLS)→ `backend/src/services/mqttDataService.ts` verify 2 lớp → `sensor_data`. Fallback HTTP `POST /api/device/data`.

## Tài liệu (`docs/`)

`00` phân tích · `01` product architecture, RBAC, claim · `02` WiFi provisioning · `03` backend (§9 API, §10 MQTT, §18 AI) · `04` database (§6 naming, §7 bảng) · `05` frontend design · `06` tiến độ frontend · `07` mobile · `08` firmware ESP-IDF · `09` security · `10` roadmap · `11` chạy local · `12` brief · `13` **PRD** (FR-x.y, NFR-*, tiêu chí nghiệm thu, §14 truy vết) · `14` MQTT TLS (hiện trạng FR-12.3, cách chạy, việc còn thiếu). PRD 13 thắng roadmap 10 khi mâu thuẫn.

Domain đích: `Customer → SmartHome → Room → Device(Gateway|Node) → Sensor → Telemetry`. API tách theo kênh: `/api/dashboard/**` (cookie, ADMIN/OPERATOR), `/api/mobile/**` (JWT Bearer, USER), `/api/device/**` (HMAC). RBAC 2 tầng: role hệ thống quyết định kênh, role trong nhà (OWNER/CONTROLLER/VIEWER/GUEST) quyết định hành động.

## Bất biến — không bao giờ vi phạm

1. Secret thiết bị/gateway chỉ trả **1 lần** khi tạo; không hiển thị trên Dashboard.
2. Không log password, token, secret, WiFi password ở bất kỳ tầng nào.
3. Không đọc/in/commit `firmware/**/config_1.h|config_2.h|config_gw.h`, `backend/.env`, `frontend/.env.local`, `mosquitto/certs/*.key`. Không tắt kiểm chứng TLS (`rejectUnauthorized: false`, `setInsecure()`).
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
- Mobile: `cd mobile && flutter analyze && flutter test` (47 test; chạy máy ảo: `--dart-define=API_BASE_URL=…` hoặc `USE_MOCK=true`, xem `docs/11`)
- Firmware: `pio run -d firmware/<node>`
- CI: `.github/workflows/ci.yml` chạy các lệnh trên (chỉ tầng có file đổi) + job "Bảo mật repo" chặn commit file bí mật và tắt TLS. Firmware build bằng `include/config_*.example.h` — thêm macro mới thì thêm vào file mẫu, không thì CI đỏ

Chưa có test tự động cho backend/frontend (mobile có 47 test) — không nói "tests pass" khi không có test nào chạy.
