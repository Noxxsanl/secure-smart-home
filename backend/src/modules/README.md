# backend/src/modules — bản đồ module V2

Nền tảng do BE-A dựng (CONTRACT_V2). BE-B/C/D xây trên đây; chỉ THÊM hàm vào module dùng chung khi bắt buộc,
đọc lại file ngay trước khi sửa và ghi vào báo cáo.

## 1. Bản đồ

| Module | Nội dung | Chủ |
|---|---|---|
| `auth/` | login/register/refresh/logout/me 3 kênh, middleware, JWT, cookie, `req.auth` | BE-A |
| `access/` | quyền theo nhà, grant của Operator | BE-A |
| `homes/` | Home/Room DTO, KIT, mã kích hoạt, `assignOwner`, timeline | BE-A |
| `devices/` | read model + DTO, telemetry hook, lệnh thiết bị + ack MQTT, behaviour log | BE-A |
| `notifications/` | tạo thông báo khách/nhân viên + mapper | BE-A |
| `logs/` | `logEvent` + danh mục event | BE-A |
| `customer/` | `createCustomerRouter(channel)` — **stub** | BE-B |
| `dashboard/` | `createDashboardRouter()` — **stub** | BE-C |
| `automation/ ai/ simulator/ maintenance/ seed/ realtime/` + `devices/deviceMonitor.ts` | **stub** `start…()` | BE-D |

Mount (`routes/index.ts`): `/api/dashboard/auth` (không phiên) → `requireDashboard("admin","operator")` → `/ai`, `/simulator`, `createDashboardRouter()`;
`/api/portal/auth` → `requirePortalUser` → `createCustomerRouter("web")`; `/api/mobile/auth` → `requireMobileUser` → `createCustomerRouter("mobile")`.
Router của kênh đã được bảo vệ: **không** tự gắn lại middleware auth, chỉ `getAuth(req)`.

## 2. Quy ước

- **Lỗi**: `throw new HttpError(status, "UPPER_SNAKE", detail?, extra?)` (`lib/http`); `notFound()` = 404, `forbidden()` = 403. Error middleware ở `app.ts` đổi thành `{error, detail?, ...extra}`; lỗi lạ → 500 `INTERNAL_ERROR` + audit `UNHANDLED_ERROR`. Express 5 tự bắt lỗi async.
- **Input**: `lib/validate` (`requireString/Int/Enum/Id/IdList/Email/IsoDate`, `parseIdParam` → 404 khi id rác, `parseLimit`, `parsePage`, `queryString`). Thiếu → 400 `MISSING_FIELDS`, sai → 400 `INVALID_INPUT`.
- **Auth**: `getAuth(req): AuthContext` (`auth/authContext`) = `{userId, role, customerId, username, email, displayName, channel, userTag}`. Không `(req as any)`. Augmentation `Express.Request.auth` nằm trong `auth/auth.types.ts`.
- **Tenant (invariant 6)**: nhà không thuộc quyền → 404; đúng thành viên nhưng thiếu quyền → 403. Luôn đi qua `requireHomeMember` / `requireDeviceAccess` / `requireRoomAccess`. Nhà `suspended` đọc được, ghi/điều khiển → `assertHomeWritable(home)` (409 `HOME_SUSPENDED`).
- **SQL**: chỉ trong repository/read-model; luôn `?`; `LIMIT ?` dưới `pool.execute` truyền `sqlLimit(n)` (chuỗi). Helper `lib/db`: `queryRows/queryOne/runSql/withTransaction/placeholders/toBool/toIso/toCount/isDuplicateKeyError`. Session MySQL ép UTC (`config/db.ts`) nên `NOW()` khớp `Date` của Node.
- **Transaction (invariant 9)**: ghi ≥ 2 bảng → `withTransaction(conn => …)`; truyền `conn` xuống các hàm nhận `Queryable`. Ném `HttpError` trong transaction = rollback.
- **Secret (invariant 1, 2)**: không trả/log secret, hash, token, mã kích hoạt bản rõ (trừ response tạo mã). `secret_key` chỉ đọc trong `hmacService` và `loadGatewaySecret` (deviceCommand.service). `logEvent` che khoá nhạy cảm trong `details` nhưng đừng dựa vào đó.
- **Giờ**: `lib/time` — `ONLINE_WINDOW_SECONDS = 90`, `isOnline(lastSeen)`, `homeLocalParts(date, tz)`, `parseHhmm`.
- Văn bản cho người dùng (thông báo, `message` audit, nhãn timeline) bằng tiếng Việt; `detail` lỗi bằng tiếng Anh.

## 3. API dùng chung (chữ ký)

### auth (`modules/auth`)
- `requireDashboard(...roles: StaffRole[]): RequestHandler`, `requirePortalUser`, `requireMobileUser`, `csrfGuard(portals)` (`auth.middleware`).
- `getAuth(req)`, `authToMeUser(auth)`, `toMeUser(row)`, `toAuthContext(row, channel)` (`authContext`).
- `authenticateAccessToken(token): Promise<{auth, expiresAt}>` — cho WS hub (khung `auth`; đóng 4401 khi `expiresAt`).
- `revokeAllRefreshTokens(userId): Promise<number>` — gọi khi `POST /me/password` (BE-B). Đổi mật khẩu khác: bcrypt cost 12.
- `registerCustomer`, `loginCustomer`… đã nối sẵn trong `auth.routes`; BE-B không cần gọi.
- `PATCH /me/profile`: đổi tên phải cập nhật **cả** `customers.full_name` và `users.full_name` (đọc ưu tiên customers).

### access (`modules/access`)
- `requireHomeMember(auth, homeId, permission?): Promise<{home: HomeRow, member, role, permissions, guestDeviceIds: number[]|null}>`
- `Permission = "view"|"control_device"|"rename"|"view_automation"|"create_automation"|"manage_any_rule"|"manage_members"|"leave"`; ma trận ở `permissions.ts` (`ROLE_PERMISSIONS`).
- `hasPermission(access, p)`, `assertPermission(access, p)`, `assertHomeWritable(home)`, `canViewDevice(access, id)`, `canControlDevice(access, {id,category})` (→ `can_control`), `canEditRule(access, ruleCreatedBy, userId)`.
- `listEffectiveMemberUserIds(homeId, roles?)`, `listEffectiveHomeIds(userId)`, `getEffectiveMemberAccess(userId, homeId)` (không ném lỗi; cho WS).
- Operator: `getActiveGrant(operatorId, homeId)`, `resolveOperatorAccess(auth, home): {restricted, grant}` (không ném), `requireOperatorHomeAccess(auth, home)` (403 `ACCESS_GRANT_REQUIRED`), `auditOperatorHomeViewed(auth, home, grant, "thành viên"|…, requestMeta(req))` — tự bỏ qua ADMIN/nhà chưa claim, giới hạn 1 dòng/5 phút/(operator, nhà, view).
- `requireDeviceAccess(auth, deviceId, permission?)` (`devices/deviceAccess`) → `{device: DeviceRow, access}`; GUEST không được phép → 404. `requireRoomAccess(auth, roomId, permission?)` (`homes/roomAccess`) → `{room, access}`.
- Thành viên hiệu lực = `user_id` set và (`expires_at` null hoặc > NOW()); lời mời đang chờ = `user_id` NULL.

### homes (`modules/homes`)
- `getHomeRow(id, db?)`, `HOME_SELECT_SQL` (alias `h`, `oc`), `toHome(row): Home`, `getRoomRow(id)`.
- `listRoomSummaries(homeId, {withClimate, roomId?, deviceIds?}, db?): RoomSummary[]` — `withClimate:false` cho Operator chưa có grant; `deviceIds` cho GUEST.
- `createKitHome(conn, {name, packageCode, address?, expectedOwnerName?, createdBy, simulated}): {home: HomeRow, rooms: RoomSummary[], gateway: DeviceRow, devices: DeviceRow[], nodes}` — KHÔNG secret; thiết bị `status='active'`; simulated → `provision_status='provisioned'`, `last_seen=now`.
- `issueActivationCode(conn, {homeId, createdBy, ttlDays?}): {code, qr_payload, expires_at}` — khoá nhà, thu hồi mã cũ chưa dùng; nhà đã claim → 409 `ALREADY_CLAIMED`.
- `revokeActivationCodes(conn, homeId, revokedBy): number`.
- `assignOwner(conn, {homeId, userId, tokenId?, actorUserId?, conflictCode?}): HomeRow` — race-safe (§4.2); claim dùng `conflictCode` mặc định `ALREADY_USED`, Operator gán dùng `"ALREADY_CLAIMED"`.
- `KIT_TEMPLATES`, `timelineLabel(eventType)`, `TIMELINE_CATEGORIES` (provision, activity, gateway).
- Các hàm trên **không ghi audit/activation_logs/notification**: endpoint tự ghi `HOME_CREATED`, `ACTIVATION_CODE_CREATED/REVOKED`, `ACTIVATION_SUCCESS|FAILED` + `activation_logs` (ghi bằng kết nối riêng để rollback không xoá log thất bại), `OWNER_ASSIGNED`; claim thành công: `notifyUser` HOME_CLAIMED + `notifyStaff("all")` + bus `home_changed`.

### devices (`modules/devices`)
- Read model: `DEVICE_SELECT_SQL` (alias `d,h,r,gw`; không có secret), `getDeviceRow`, `getDeviceRowByUid`, `listDeviceRowsByIds`, `listHomeDeviceRows(homeId, {includeGateway?})`, `latestReadings(ids): Map<id, Reading>`, `getTelemetrySeries(id, "24h"|"7d")`, `getGatewayCounts(ids)`, `buildReading(data, at)`.
- Mapper: `toCustomerDevice(row, {canControl, latest})`, `toConsoleDevice(row)`, `toGateway(row, counts)`, `toDeviceStateSnapshot(row)`, `toDeviceStateEvent(row)`.
- `onTelemetryIngested({sensorDbId, gatewayDbId, data, receivedAt})` — đã nối vào MQTT + HTTP ingest (gọi sau INSERT, trước khi cập nhật `last_seen`). Simulator gọi cùng hàm sau khi tự INSERT `sensor_data` (và tự cập nhật `last_seen`).
- `sendDeviceCommand({deviceId, action, issuedBy, source, channel, behaviorSource?, meta?}): {command, device: DeviceRow}` — lỗi: 404, 400 `NOT_CONTROLLABLE`, 409 `DEVICE_BLOCKED|HOME_SUSPENDED|DEVICE_OFFLINE`, 504 `TIMEOUT`, 502 `COMMAND_FAILED`. **Không kiểm quyền người dùng** — gọi `requireDeviceAccess(auth,id,"control_device")` trước. Tự ghi `device_commands`, `power_state`, bus `device_state`, behaviour log, audit `DEVICE_COMMAND`/`DEVICE_COMMAND_FAILED` (đừng ghi lại).
- `sendGatewayCommand({gatewayId, action, issuedBy, meta?}): {commandId, rowId}` — tự ghi audit `GATEWAY_RESTART|GATEWAY_FACTORY_RESET`; gateway chưa gán nhà → 409 `GATEWAY_NOT_ASSIGNED`. Trả `202 {command_id: commandId}`. Quyền grant của Operator do BE-C kiểm.
- `publishOtaCommand({gatewayId, jobId, version, targetType, checksumSha256}): Promise<boolean>`.
- Simulator: `registerSimulatedCommandHandler(async (cmd: SimulatedCommand) => ({status:"ok", power?}))`, `cmd.kind` = `"device"|"gateway"`; handler tự chờ 300–900 ms. Lệnh cho `is_simulated=1` mà chưa có handler → đi MQTT (TIMEOUT).
- `logBehavior({homeId, timezone, userId, roomId, deviceId, deviceCategory, action:"TURN_ON"|"TURN_OFF", previousState, newState, source, at?})`.
- `startCommandAckListener()` đã gọi trong `server.ts`.

### notifications / logs / bus
- `notifyHomeMembers({homeId, roles?, type, title, message, severity, excludeUserId?, relatedDeviceId?}): number`, `notifyUser({userId, homeId?, …})`, `notifyStaff({targetRole:"admin"|"operator"|"all", type, title, message, severity, homeId?, relatedDeviceId?, actor?})`. Không bao giờ ném lỗi. `notifyHomeMembers/notifyUser` phát bus `notification`. Mapper `toCustomerNotification`, `toStaffNotification`, `NOTIFICATION_SELECT_SQL`.
- `logEvent({eventType, category?, severity?, message?, homeId?, deviceId?, actorUserId?, ip?, userAgent?, details?}, db?)` — không ném lỗi; mặc định từ `logs/eventCatalog` (thêm `HOME_STATUS_CHANGED`, `UNHANDLED_ERROR`); event lạ → `error/critical`. `home_id` tự suy từ `deviceId` nếu bỏ trống. `requestMeta(req)` (`lib/clientIp`) cho ip/userAgent. `services/auditLogger.log()` cũ đi qua cùng hàm.
- `eventBus` (`lib/eventBus`): `on(event, listener): unsubscribe`, `emit`. Sự kiện: `telemetry`, `device_state`, `notification`, `home_changed` (BE-B/C phát `home_changed` khi đổi thành viên/vai trò/tên/phòng/claim/trạng thái nhà). Listener lỗi bị bọc.

## 4. Stub & chủ sở hữu (mỗi file có `// TODO(BE-x)`)
`customer/customer.routes.ts` `createCustomerRouter(channel)` (BE-B) · `dashboard/dashboard.routes.ts` `createDashboardRouter()` (BE-C) ·
`ai/ai.routes.ts` `createAiRouter()`, `simulator/simulator.routes.ts` `createSimulatorRouter()`, `seed/demoSeed.ts` `runDemoSeed()`, `realtime/wsHub.ts` `attachWsHub(server)`,
`devices/deviceMonitor.ts` `startDeviceMonitor()` (hiện gọi heartbeat cũ), `automation/automationEngine.ts` `startAutomationEngine()`, `ai/habitSuggestion.job.ts` `startHabitSuggestionJob()`,
`simulator/simulator.ts` `startSimulator()`, `maintenance/retention.job.ts` `startRetentionJob()` (BE-D).
Lưu ý: đã bỏ prune "150 dòng/sensor" ở 2 đường ingest → **retention job là thứ duy nhất giới hạn `sensor_data`**.

## 5. Schema & migration
Entry cuối `config/migrate.ts` (append-only, 1 câu/entry); DDL cuối cùng cho DB mới ở `database/migrations/001_schema.sql` — hai nơi phải khớp. `runMigrations()` coi lỗi "đã tồn tại" (1050/1060/1061/1826) là đã áp dụng, lỗi khác → log `[migrate] FAILED <name>: …` và dừng (trả `false`, server vẫn chạy, seed bị bỏ qua). Cột FK dùng `INT UNSIGNED` (khớp `users.id`/`devices.id`).
