# backend/src — bản đồ module → feature

Backend là **modular monolith** trên Express 5 (không NestJS, không DI container — xem `docs/DESIGN_PATTERNS.md` §7).
Mỗi domain là một module; trong module, mỗi use case là một feature. Quy tắc phụ thuộc được kiểm tự động bằng
`npm run check:arch` (`backend/tools/check-architecture.mjs`, chạy trong CI cùng `tsc`).

## 1. Bố cục

```
backend/src/
├── main.ts              # bootstrap: migrate → demo seed → listen → attachWsHub → worker của mọi module
├── app.ts               # helmet/cors/json/log → rate limit → /api (app.module) → 404 → error filter
├── app.module.ts        # APP_MODULES + gắn module vào các kênh API; không chứa nghiệp vụ
├── config/env.ts        # nạp .env, kiểm biến bắt buộc lúc boot
├── core/                # cross-cutting, không phụ thuộc module
│   ├── auth/            # auth-context.ts (AuthContext, getAuth, req.auth), roles.ts (requireAdmin)
│   ├── http/            # request-meta.ts (IP, user agent), rate-limit.ts, request-logger.ts
│   ├── filters/         # error.filter.ts — HttpError → { error, detail?, …extra }; lỗi lạ → 500
│   └── health/
├── shared/              # shared kernel: errors/http-error.ts, validation/validate.ts, types/domain.ts, crypto.ts,
│                        # time.ts, privacy.ts, events/{event-bus, event-payloads}.ts, module.ts (interface AppModule)
├── infrastructure/      # database/{pool, db, migrate, like-pattern}.ts, mqtt/broker.ts
├── modules/<m>/         # xem §2
├── seed/demo-seed.ts    # dữ liệu demo (composition: được import index của mọi module)
└── scripts/seed.ts      # npm run seed
```

Một module:

```
modules/<m>/
├── index.ts             # cửa ra DUY NHẤT — <m>Module + hàm facade + type công khai (danh sách tường minh)
├── <m>.module.ts        # bảng route theo kênh + worker (AppModule)
├── <m>.facade.ts        # hàm module khác được gọi
├── domain/              # kiểu, DTO, mapper, policy, logic dùng chung giữa các feature của module
├── infrastructure/      # *.repository.ts — SQL trên bảng của mình; *.read-model.ts — truy vấn chỉ-đọc JOIN bảng module khác
└── features/<feature>/  # một use case: <f>.controller.ts (HTTP) · <f>.handler.ts (nghiệp vụ) · <f>.dto.ts
                         #   · <f>.consumer.ts (MQTT) · <f>.job.ts (timer / listener eventBus)
```

`AppModule` (`shared/module.ts`) có các móc theo kênh: `device` (`/api/device/**`, HMAC), `dashboard`
(`/api/dashboard/**`, sau `requireDashboard("admin","operator")`), `customer` (`/api/portal/**` + `/api/mobile/**`,
cùng handler, tham số `channel`), `api` (chỉ legacy), `workers`. Router `/auth` của 3 kênh do identity export và
`app.module.ts` mount TRƯỚC guard của kênh. Module không bao giờ `router.use(mw)` không kèm path trên router của kênh.

## 2. Module

| Module | Bảng sở hữu | Feature | Worker |
|---|---|---|---|
| `identity` | users, customers, refresh_tokens | login, register, logout, refresh-session, get-me, get-profile, update-profile, change-password, list/create/update/delete-staff, search-customers, get-customer-detail · `guards/` (requireDashboard, requirePortalUser, requireMobileUser, csrfGuard) | refreshTokenRetention |
| `homes` | smart_homes, rooms, smart_home_members, member_device_access, operator_home_access, activation_tokens, activation_logs | list-my-homes, get-home-overview, update-home, get-room, rename-room, list/invite/update/remove-member, leave-home, list/accept/decline-invitation, claim-home · list/create/get/update-smart-home, assign-owner, issue-activation-code, revoke-activation-codes, request-home-access, list/grant/revoke-operator-grant | — |
| `devices` | devices, device_tokens | get-device-detail, rename-device, list-console-devices, get-console-device-detail, set-device-status, update-device, remove-device, list-gateways, get-gateway-detail, list-gateway-sensors, presence-monitor, track-device-ip | deviceMonitor, mqttTracker |
| `telemetry` | sensor_data | ingest-http, ingest-mqtt, get-device-telemetry, purge-old-telemetry | mqttDataService, retentionJob |
| `control` | device_commands, user_behavior_logs | send-device-command, send-gateway-command, publish-ota-command, command-ack | commandAckListener |
| `automation` | automation_rules, automation_history | list/create/update/delete-automation, get-automation-history, list-console-automations, toggle-automation, run-automation-engine | automationEngine |
| `recommendations` | recommendation_history, user_feedback | list-suggestions, accept-suggestion, dismiss-suggestion, run-habit-suggestions | habitSuggestionJob |
| `notifications` | notifications | list-notifications, mark-notifications-read, list-staff-notifications, mark-staff-notifications-read | — |
| `ota` | firmware, ota_jobs, ota_history | list-firmware, upload-firmware, update-firmware, list-deployments, create-deployment, rollback-deployment | — |
| `audit` | audit_log | list-logs, delete-logs · `logEvent` cho mọi module | — |
| `stats` | — | get-badges, get-operator-stats, get-admin-stats | — |
| `realtime` | — | mobile-ws (`attachWsHub`, WebSocket `/api/mobile/ws`, gọi từ main.ts) | — |
| `simulator` | — (miễn T1/T2) | get-simulator-status, simulate-device-power, simulate-door, simulator-engine | simulator |
| `legacy` | — (miễn T1/T2) | route Prototype `/api/{auth,devices,audit-log,users,notifications}` giữ cho `tests/security/attack_demo*.sh`; không tách feature, không phát triển thêm | — |

Camera (snapshot/live) chưa hiện thực — khi làm sẽ là module `camera` + port lưu ảnh ở `infrastructure/storage`
(`docs/DESIGN_PATTERNS.md` §3.2c). `recommendations` là gợi ý thói quen thống kê, KHÔNG phải AI agent của
`docs/proposals/DE_XUAT_AI_AGENT.md` (draft).

## 3. Quy tắc phụ thuộc (`npm run check:arch`)

| Mã | Quy tắc |
|---|---|
| L1 | Tầng: config → (không) · shared → shared · infrastructure → config, shared · core → config, shared, infrastructure · modules → các tầng trên + index module khác. Không ai import composition root. |
| L2 | Module khác chỉ qua `index.ts` (`import { x } from "../../devices"`). |
| L3 | Feature không import feature khác, không import index/facade/module của chính module. domain/, infrastructure/, guards/ không import features/. Logic nhiều feature cần → `domain/`; module khác cần → facade. |
| L4 | Không còn `_staging/`. |
| T1 | Chỉ module chủ được INSERT/UPDATE/DELETE bảng của mình; module khác gọi facade (hàm nhận `db?: Queryable` để chạy trong transaction của người gọi — bất biến 9). |
| T2 | FROM/JOIN bảng module khác chỉ trong `*.read-model.ts` (chỉ đọc). Ngoại lệ có lý do: `// arch-allow T2: …` (hiện dùng ở `audit/infrastructure/{log-event,legacy-audit-logger}.ts` — INSERT … SELECT home_id nguyên tử). |
| T3 | Không import hằng `*_SQL` từ module khác. |
| C1 | Giá trị import từ module khác chỉ dùng trong thân hàm. Vòng import giữa module (vd homes ↔ devices) là hợp lệ nhờ live binding của CommonJS, nhưng ở top-level giá trị có thể còn `undefined`. |

Phản ứng chéo module không đồng bộ đi qua `eventBus` (`shared/events/event-bus.ts`): `telemetry`, `device_state`,
`notification`, `home_changed`; payload định nghĩa ở `shared/events/event-payloads.ts`. Listener lỗi bị bọc.
Gọi đồng bộ (kiểm quyền, ghi audit, gửi thông báo) đi qua facade.

So với mẫu tham khảo NestJS: `app.module.ts` thay `@Module`, `AppModule` thay provider/controller decorator,
`eventBus` thay `@nestjs/event-emitter`, `check-architecture.mjs` thay dependency-cruiser; guard nằm trong
`identity/guards` (không ở `core/auth`) vì guard nạp lại user từ bảng `users` ở mỗi request.

## 4. Quy ước

- **Lỗi**: `throw new HttpError(status, "UPPER_SNAKE", detail?, extra?)` (`shared/errors/http-error`); `notFound()` = 404, `forbidden()` = 403. Error filter đổi thành `{error, detail?, ...extra}`; lỗi lạ → 500 `INTERNAL_ERROR` + audit `UNHANDLED_ERROR`. Express 5 tự bắt lỗi async.
- **Input**: `shared/validation/validate` (`requireString/Int/Enum/Id/IdList/Email/IsoDate`, `parseIdParam` → 404 khi id rác, `parseLimit`, `parsePage`, `queryString`). Thiếu → 400 `MISSING_FIELDS`, sai → 400 `INVALID_INPUT`.
- **Auth**: `getAuth(req): AuthContext` (`core/auth/auth-context`) = `{userId, role, customerId, username, email, displayName, channel, userTag}`. Không `(req as any)`. Router của kênh đã được bảo vệ: không tự gắn lại guard, trừ hạn chế role theo route (vd `requireDashboard("admin")`, `requireAdmin(auth)`).
- **Tenant (bất biến 6)**: nhà không thuộc quyền → 404; đúng thành viên nhưng thiếu quyền → 403. Luôn đi qua `requireHomeMember` / `requireRoomAccess` (homes) / `requireDeviceAccess` (devices). Nhà `suspended` đọc được, ghi/điều khiển → `assertHomeWritable(home)` (409 `HOME_SUSPENDED`). Operator trên nhà đã claim cần grant (`requireOperatorHomeAccess`, `loadStaffScope`).
- **SQL**: chỉ trong `infrastructure/`; placeholder `?` — `infrastructure/database/db` tự đổi sang `$1..$n`; INSERT cần id thì `RETURNING id`; boolean so `= TRUE/FALSE`; username/email so `LOWER(col) = LOWER(?)`. Helper: `queryRows/queryOne/runSql/withTransaction/placeholders/toBool/toIso/toCount/isDuplicateKeyError` (SQLSTATE `23505`). Session PostgreSQL ép UTC (`infrastructure/database/pool.ts`).
- **Transaction (bất biến 9)**: ghi ≥ 2 bảng → `withTransaction(conn => …)`, truyền `conn` xuống mọi hàm (kể cả facade module khác). Ném `HttpError` trong transaction = rollback. Log thất bại của claim ghi bằng kết nối riêng để rollback không xoá.
- **Secret (bất biến 1, 2)**: không trả/log secret, hash, token, mã kích hoạt bản rõ (trừ response tạo mã). `secret_key` chỉ được SELECT trong module devices (`infrastructure/device-secret.repository.ts`); module khác ký/kiểm HMAC bằng secret gateway qua `getGatewaySigner` (devices/domain/gateway-signer.ts) — chỉ nhận hàm `sign`/`verify`, không nhận secret. `logEvent` che khoá nhạy cảm trong `details` nhưng đừng dựa vào đó.
- **Bất biến 4**: HTTP `telemetry/features/ingest-http/` (`validate-device.middleware.ts` → controller/handler) và MQTT `telemetry/features/ingest-mqtt/` (consumer/handler) cùng gọi `verifyGatewayHMAC`/`verifyDeviceHMAC`/`registerAuthFailure` của devices và `telemetry/domain/ingest-common.ts` (`authFailureEventType`: timestamp quá hạn → `REPLAY_ATTACK` ở cả hai đường). Đổi logic xác thực phải sửa ở đó, cả hai đường cùng hưởng.
- **Giờ**: `shared/time` — `ONLINE_WINDOW_SECONDS = 90`, `isOnline(lastSeen)`, `homeLocalParts(date, tz)`, `parseHhmm`.
- Văn bản cho người dùng (thông báo, `message` audit, nhãn timeline) bằng tiếng Việt; `detail` lỗi bằng tiếng Anh.

## 5. Thêm một feature

1. Tạo `modules/<m>/features/<dong-tu-danh-tu>/` với controller + handler (+ dto).
2. Khai báo route trong `<m>.module.ts` ở đúng kênh; route có rate limit riêng thì thêm vào `core/http/rate-limit.ts`.
3. Cần dữ liệu module khác: gọi hàm trong `index.ts` của nó; chỉ cần đọc để hiển thị → `infrastructure/<x>.read-model.ts`.
4. Module khác cần dùng logic này → đưa vào `domain/`, export qua `<m>.facade.ts` + `index.ts`.
5. `npx tsc --noEmit && npm run check:arch`.

## 6. Schema & migration

`infra/postgres/migrations/001_schema.sql` là baseline PostgreSQL đầy đủ; mảng `migrations` trong
`infrastructure/database/migrate.ts` bắt đầu rỗng — thay đổi schema mới thêm entry cuối (append-only, 1 câu/entry,
bảng `_migrations`) **và** cập nhật baseline — hai nơi phải khớp. Bảng mới phải có chủ sở hữu trong `TABLE_OWNERS`
của `tools/check-architecture.mjs` (checker báo lỗi nếu thiếu). `runMigrations()` coi lỗi "đã tồn tại" (SQLSTATE
`42P07`/`42701`/`42710`) là đã áp dụng; lỗi khác → `[migrate] FAILED <name>: …`, server vẫn chạy, seed bị bỏ qua.
