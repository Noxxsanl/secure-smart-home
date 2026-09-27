# Secure Smart Home IoT

Đồ án tốt nghiệp đang chuyển từ **demo quản lý thiết bị IoT** (Prototype) sang **nền tảng Smart Home thương mại** (V2 = mục tiêu bảo vệ). `docs/` là nguồn sự thật cho **kiến trúc đích**, code là nguồn sự thật cho **hiện trạng** — khi lệch nhau, luôn nói rõ đang mô tả cái nào.

## Codebase

| Tầng | Thư mục | Stack | Trạng thái |
|---|---|---|---|
| Backend | `backend/src/` | Express 5, TypeScript strict, mysql2, mqtt, JWT cookie, bcrypt | Chạy thật; SQL viết thẳng trong `routes/*.ts`; chưa có WebSocket (gói `ws` có nhưng chưa dùng) |
| Database | `database/migrations/001_schema.sql`, `backend/src/config/migrate.ts` | MySQL 8, UTC | `users`, `devices`, `sensor_data`, `device_tokens`, `audit_log`, `notifications` |
| Web (3 app) | `frontend/{admin,operator,user}/`, dùng chung `frontend/packages/{shared,console}` | Next.js **16.2.5**, React 19, Tailwind v4, SWR, npm workspaces | **100% mock** (`packages/shared/mock/`). Mỗi role hệ thống một app (:3001/:3002/:3003). App `user` là cổng web khách hàng — ngoài phạm vi PRD V2 (§2.2, FR-1.4), xem `frontend/README.md` |
| Mobile | `mobile/lib/` | Flutter, chưa có package nào ngoài SDK | **100% UI mockup**, cho khách hàng (USER) |
| Firmware | `firmware/{gateway-node,sensor-node,sensor-node-2}` | PlatformIO + Arduino, `esp32doit-devkit-v1` | Chạy thật. `firmware/ESP32-S3-Touch-LCD-7B` là vendor — không sửa |
| Hạ tầng | `docker-compose.yml`, `mosquitto/`, `nginx/` | 2 broker Mosquitto (1883, 1884), MySQL host 3308 | Không TLS, `allow_anonymous true` |
| Demo tấn công | `scripts/attack_demo*.sh` | bash + curl + openssl | Dùng khi bảo vệ |

Luồng dữ liệu: Sensor —`local/sensors/+/data` (Broker 1)→ Gateway verify HMAC sensor, ký HMAC gateway —`gateway/<GW_ID>/data` (Broker 2)→ `backend/src/services/mqttDataService.ts` verify 2 lớp → `sensor_data`. Fallback HTTP `POST /api/device/data`.

## Tài liệu (`docs/`)

`00` phân tích · `01` product architecture, RBAC, claim · `02` WiFi provisioning · `03` backend (§9 API, §10 MQTT, §18 AI) · `04` database (§6 naming, §7 bảng) · `05` frontend design · `06` tiến độ frontend · `07` mobile · `08` firmware ESP-IDF · `09` security · `10` roadmap · `11` chạy local · `12` brief · `13` **PRD** (FR-x.y, NFR-*, tiêu chí nghiệm thu, §14 truy vết). PRD 13 thắng roadmap 10 khi mâu thuẫn.

Domain đích: `Customer → SmartHome → Room → Device(Gateway|Node) → Sensor → Telemetry`. API tách theo kênh: `/api/dashboard/**` (cookie, ADMIN/OPERATOR), `/api/mobile/**` (JWT Bearer, USER), `/api/device/**` (HMAC). RBAC 2 tầng: role hệ thống quyết định kênh, role trong nhà (OWNER/CONTROLLER/VIEWER/GUEST) quyết định hành động.

## Bất biến — không bao giờ vi phạm

1. Secret thiết bị/gateway chỉ trả **1 lần** khi tạo; không hiển thị trên Dashboard.
2. Không log password, token, secret, WiFi password ở bất kỳ tầng nào.
3. Không đọc/in/commit `firmware/**/config_1.h|config_2.h|config_gw.h`, `backend/.env`, `frontend/.env.local`.
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
- Mobile: `cd mobile && flutter analyze && flutter test`
- Firmware: `pio run -d firmware/<node>`

Chưa có test tự động cho backend/frontend — không nói "tests pass" khi không có test nào chạy.
