# 06_FRONTEND_REFACTOR_PROGRESS.md

> Tiến độ refactor `frontend/` theo `05_FRONTEND_REFACTOR_SMARTHOME.md`. Cập nhật theo từng module hoàn thành.
> Phạm vi đã thực hiện: **Phase 0–7** của roadmap trong tài liệu gốc (Design Foundation → Sidebar/Dashboard tách role → Smart Home/Room/Device → Customer/Provisioning → Gateway/OTA → Logs/Notification Center → Team/Operator Access → Automation MVP).
> **Quyết định phạm vi dữ liệu:** toàn bộ Dashboard — **kể cả đăng nhập** — chạy trên Mock Data, không cần backend chạy nền. `features/auth/api/auth.api.ts` dùng 2 tài khoản demo cố định (`admin`/`admin123`, `operator01`/`operator123`), phiên đăng nhập lưu ở `localStorage` (khoá `mock_auth_session`) thay vì cookie thật. (Quyết định ban đầu là giữ auth thật — đã đổi theo yêu cầu sau đó của user để không cần chạy backend.) Route proxy `app/api/[...path]/route.ts` và `shared/api/client.ts` đã bị xoá vì không còn nơi nào gọi tới backend thật nữa.

---

## 0. Nền tảng dùng chung (Phase 0)

**File mới:**
- `frontend/src/shared/mock/types.ts` — toàn bộ domain type mới: `Customer`, `SmartHome`, `Room`, `HomeMember`, `Gateway`, `MockDevice` (mở rộng `ApiDevice` có sẵn với `home_id`/`room_id`/`category`), `Camera`, `AutomationRule`, `FirmwareVersion`, `OtaDeployment`, `WarrantyRecord`, `ActivationRecord`, `OperatorAccessGrant`, `LogCategory`/`LogEntry`, `MockNotification` (mở rộng `AppNotification` có sẵn), `HomeTimelineEvent`. `StaffAccount` tái dùng thẳng `ApiUser` — không tạo type trùng.
- `frontend/src/shared/mock/seed.ts` — dữ liệu seed. Home #1 ("Nhà của Đạt") đồng bộ 1:1 với `mobile/lib/features/profile/data/mock_household.dart` (tên nhà, địa chỉ, gói, firmware gateway, 3 members) và `mobile/lib/features/rooms/data/mock_rooms.dart`/`mock_devices.dart` (4 phòng, 7 thiết bị — giữ nguyên tên/mô tả). Các Customer/Home/Gateway còn lại (11 nhà, 10 khách hàng) là dữ liệu tổng hợp mới, đúng cấu trúc nhưng không sao chép mobile (mobile không có các entity này).
- `frontend/src/shared/mock/store.ts` — "database" in-memory dạng singleton module-level, các hàm `list/get/create/update/delete` theo domain + `mockDelay()`. Mọi hook mock đều gọi qua đây, không phải tự tạo state riêng.
- Design tokens: `frontend/src/app/globals.css` — thêm `--brand/--critical/--warning/--success/--info/--surface/--canvas` (+ `-soft` variants), light/dark, đăng ký qua Tailwind v4 `@theme` để có class `bg-brand`, `text-critical`,... `shared/ui/Button.tsx` đổi variant `default` sang `bg-brand`.
- Shared UI primitives mới: `shared/ui/StatusBadge.tsx`, `SeverityBadge.tsx`, `ProgressBar.tsx`, `EmptyState.tsx`, `Toast.tsx` (+`ToastProvider`/`useToast`), `Stepper.tsx`, `Timeline.tsx`.
- `features/devices/components/DeviceStatusBadge.tsx` giữ nguyên API, nay là wrapper mỏng gọi `StatusBadge` (không phá vỡ chỗ đang dùng).

**Component tái sử dụng:** `ConfirmDialog`, `StatsCard`, `OnlineIndicator`, pattern filter/pagination/toolbar của `DevicesPage`/`AuditPage` cũ.

---

## 1. Sidebar / Dashboard / RoleGuard (Phase 1)

**File mới:** `widgets/app-shell/nav-config.ts` (1 nguồn duy nhất, section + role + badgeKey), `widgets/app-shell/RoleGuard.tsx`, `widgets/app-shell/ShellFrame.tsx` (client wrapper quản lý state collapse, sửa lỗi `ml-60` cố định nêu ở tài liệu §16.1).
**File sửa:** `widgets/app-shell/Sidebar.tsx` (đọc `NAV_SECTIONS`, lọc theo role, collapse icon-only, badge số liệu tính từ mock store), `widgets/app-shell/constants.ts` (xoá `NAV_ITEMS` trùng lặp, giữ `SIDEBAR_WIDTH` + thêm `SIDEBAR_COLLAPSED_WIDTH`), `widgets/app-shell/Header.tsx` (bỏ đồng hồ trang trí, mở notification cho Operator, thu gọn dropdown còn 5 mục + link `/notifications`), `widgets/app-shell/Breadcrumb.tsx` (thêm nhãn route mới), `app/(private)/layout.tsx` (bọc `RoleGuard` + `ToastProvider` + `ShellFrame`, bỏ `DevicesProvider`/`AddDeviceProvider` cũ).
**File mới (Dashboard):** `features/dashboard/hooks/useAdminDashboard.ts`, `useOperatorDashboard.ts`, `pages/AdminDashboardPage.tsx`, `pages/OperatorDashboardPage.tsx`. `pages/DashboardPage.tsx` nay chỉ là router chọn theo `user.role`.
**Đã xoá (dead code sau refactor):** `features/dashboard/hooks/useDashboardStats.ts`, `features/dashboard/components/RealtimeClock.tsx`, `features/devices/providers/{DevicesProvider,AddDeviceProvider}.tsx`, `features/devices/components/{AddDeviceModal,RegisterModal}.tsx`, `features/devices/types.ts`.

---

## 2. Smart Homes (Phase 2) — `features/smart-homes/`

**File mới:** `hooks/useSmartHomes.ts`, `hooks/useSmartHomeDetail.ts`, `pages/SmartHomeListPage.tsx`, `pages/SmartHomeDetailPage.tsx` (tab Thông tin/Rooms/Devices/Members/Automation/Camera/History/Log), `pages/ProvisioningWizardPage.tsx` (5 bước: Create Home → Room/Device Preview → Generate Gateway → Activation Code/QR → Ready to Sell), `components/RoomCard.tsx`.
**Route:** `/smart-homes`, `/smart-homes/new`, `/smart-homes/[id]`.
**Reused:** `Stepper`, `Timeline`, `StatusBadge`, table/filter pattern từ `DevicesPage` cũ.
**Business flow đã mô phỏng đúng:** tạo Home mới sinh Room/Device theo template KIT_A/KIT_B, sinh Gateway UID, sinh Activation Code + QR **không hiện secret**, chuyển trạng thái sẵn sàng bán.

---

## 3. Devices (mở rộng) — `features/devices/`

**Sửa:** `pages/DevicesPage.tsx` (bỏ tab Gateway/Sensor cứng → filter theo `category` động: sensor/relay/camera/door_contact; thêm cột Smart Home + Room; bỏ hoàn toàn nút "Thêm thiết bị"/secret key plaintext theo yêu cầu bảo mật §9.6), `pages/DeviceDetailPage.tsx` (sửa thiếu dark mode toàn trang theo §1.6, thêm breadcrumb Home/Room, chart chỉ hiện khi `category === "sensor"`), `hooks/{useDeviceList,useDeviceDetail,useSensorData}.ts` (chuyển sang mock store), `components/SensorChart.tsx` (bổ sung dark mode).
**Đã xoá:** `api/devices.api.ts` (hook gọi thẳng mock store, không cần lớp trung gian nữa).

---

## 4. Gateways — `features/gateways/` (mới)

`hooks/useGateways.ts`, `useGatewayDetail.ts`, `pages/GatewayListPage.tsx`, `pages/GatewayDetailPage.tsx` (đủ 8 chỉ số: RSSI/Firmware/WiFi/MQTT/Last Seen/Provision/Pair/Node Count + Restart/Factory Reset qua `ConfirmDialog`).
**Route:** `/gateways`, `/gateways/[id]`.

## 5. Customers — `features/customers/` (mới)

`hooks/useCustomers.ts`, `useCustomerDetail.ts`, `pages/CustomerListPage.tsx`, `pages/CustomerDetailPage.tsx` (Purchased Homes / Warranty / Activation History — 3 khối theo §9.9).
**Route:** `/customers`, `/customers/[id]`.

## 6. OTA & Firmware — `features/ota/` (mới)

`hooks/useOta.ts`, `pages/OtaPage.tsx` (tab Gateway/Node, `ProgressBar` rollout, Deploy/Rollback là mock state transition qua `firmwareStore`).
**Route:** `/ota`.

## 7. Logs Center — `features/logs/` (viết lại)

**Sửa:** `components/LogTable.tsx` (tổng quát hoá từ `AuditLogTable` cũ — filter/pagination/bulk-delete/JSON-detail pattern giữ nguyên, nay nhận `LogEntry[]` theo category thay vì audit-log cố định).
**Mới:** `hooks/useLogEntries.ts`, `pages/LogCategoryPage.tsx` (1 trang dùng chung cho cả 10 category qua route param `[category]`).
**Route:** `/logs/[category]` — thay thế hoàn toàn `/audit` và `/logs` cũ.
**Đã xoá:** toàn bộ `features/audit/` (Security Log + User Activity Log mới đã thay thế đúng theo §9.11 — "Audit Log không biến mất, trở thành hợp phần của 2 log mới"), `features/logs/types.ts`, `features/logs/pages/LogsPage.tsx` (placeholder chết cũ).

## 8. Notification Center — `features/notifications/` (nâng cấp)

**Sửa:** `api/notifications.api.ts`, `hooks/useNotifications.ts` (mock store, mở cho cả Operator — trước đây chỉ Admin).
**Mới:** `pages/NotificationCenterPage.tsx` (`/notifications`, filter theo severity, mark-all-read).
**Sửa `Header.tsx`:** dropdown còn 5 mục mới nhất + link "Xem tất cả".

## 9. Team & Operator Access — `features/team/` (đổi tên từ `features/users/`)

**Mới:** `hooks/useTeam.ts`, `hooks/useOperatorAccess.ts`, `pages/TeamListPage.tsx` (= `UsersPage` cũ, đổi tên hiển thị "Team & Roles", thêm chọn Role khi tạo), `pages/OperatorAccessPage.tsx` (cấp quyền có Reason + Thời hạn bắt buộc, danh sách active/expired/revoked, nút Thu hồi).
**Route:** `/team`, `/team/access`.
**Đã xoá:** `features/users/`, route `/users`.
**Lược bỏ có chủ đích:** modal đổi mật khẩu của `UsersPage` cũ không mang sang — mock store không có xác thực thật nên "đổi mật khẩu" không có ý nghĩa để demo; trường mật khẩu vẫn có ở form tạo tài khoản để giữ đúng UX nhưng không được lưu ở đâu.

## 10. Automation — `features/automation/` (mới, MVP theo đúng §9.12 — không làm drag-drop)

`hooks/useAutomation.ts`, `pages/AutomationPage.tsx` (form IF/THEN chọn Home → Room → metric/operator/threshold → action, danh sách rule + toggle bật/tắt + xoá).
**Route:** `/automation`.

## 11. Settings — `features/settings/` (mới, tối giản)

`pages/SettingsPage.tsx` — hiển thị danh mục Room Type/Device Category hiện có từ mock data + placeholder MQTT Broker. Không phải mục tiêu chính của refactor này nhưng cần một trang thật (không phải dead link) vì Sidebar mới có mục Settings (Admin only).

---

## Mock Data đã thêm (tổng quan)

**Đã giảm quy mô theo yêu cầu user** (Smart Homes/Customers/Gateways/OTA) — số liệu hiện tại: 5 Customer · 6 Smart Home (1 rich + 3 active + 1 suspended + 2 unclaimed) · 9 Room · 6 Gateway (1:1 với Home) · 15 Device · 2 Camera · 3 Automation Rule · 3 Firmware Version · 2 OTA Deployment · 4 Warranty Record · 5 Activation Record · 2 Operator Access Grant · ~30 Log Entry (10 category, không đổi) · 10 Notification · 3 Staff Account. Home #1 + Room/Device của nó vẫn lấy trực tiếp từ mock data hiện có trong `mobile/lib`. Toàn bộ ID được đánh số lại tuần tự và nhất quán giữa các bảng (Home↔Customer↔Gateway↔Room↔Device↔Log/Notification home_id).

## OTA — luồng Upload → Store → Deploy

`shared/mock/store.ts`'s `firmwareStore` nay có 3 bước tách biệt phản ánh đúng luồng OTA thật:
1. **Upload** (`firmwareStore.upload()`, modal mới `features/ota/components/UploadFirmwareModal.tsx`) — chọn Loại/Version/file `.bin` thật (đọc tên+dung lượng qua File API)/cờ Stable → lưu thành 1 `FirmwareVersion` mới, **chưa có deployment nào** (bảng hiện "— chưa deploy").
2. **Deploy** (nút có sẵn trên mỗi dòng chưa deploy) — tạo `OtaDeployment` mới, `progress_percent` bắt đầu từ 0.
3. **Progress** (`firmwareStore.advanceInProgress()`, gọi mỗi 1.5s qua `useEffect` trong `OtaPage.tsx` khi có deployment `in_progress`) — mô phỏng thiết bị báo cáo tiến trình flash về, tự tăng dần đến 100% rồi chuyển `completed`.
`FirmwareVersion` mở rộng thêm `file_name`/`size_kb`, hiển thị dưới version trong bảng.

## Kiểm tra đã chạy

- `npx tsc --noEmit` — pass, không lỗi.
- `npx eslint src --max-warnings=0` — không phát sinh lỗi/warning mới từ phần code đã refactor (3 warning/1 error còn lại thuộc `LoginPage.tsx`/`shared/ui/Select.tsx`/`shared/ui/ThemeToggle.tsx` — code cũ, không đụng tới trong đợt refactor này).

## TODO — còn lại cho phase sau

1. **Phase 8 — Responsive hardening sâu hơn:** Sidebar đã có chế độ collapse icon-only, nhưng chưa có chế độ mobile (hamburger + overlay full-screen) và chưa chuyển bảng dữ liệu mật độ cao (Logs/Gateways) sang dạng card trên màn hẹp như §16.2 đề xuất.
2. **Phase 8 — Login rebrand:** `LoginPage.tsx` chưa đổi thẩm mỹ (vẫn gradient tím-hồng cũ) và chưa thêm dòng "Cổng quản trị nội bộ — khách hàng dùng Mobile App" theo §9.15. Giữ nguyên vì đây là hạng mục thẩm mỹ thuần, mức ưu tiên thấp nhất theo roadmap gốc.
3. **Phase 9 — Automation dạng kéo-thả (flow builder):** tài liệu gốc khuyến nghị chỉ đầu tư khi tập trigger/action đã phong phú hơn form IF/THEN hiện tại — chưa làm, đúng theo khuyến nghị.
4. ~~Xác thực với tài khoản Operator thật~~ — **đã giải quyết**: login nay hoàn toàn mock, đăng nhập `operator01`/`operator123` để xem đúng `OperatorDashboardPage`/Sidebar biến thể Operator mà không cần backend.
5. **Room/Device management form trong Smart Home Detail:** tab Rooms hiện cho xem thiết bị theo phòng nhưng chưa có nút "Thêm thiết bị vào phòng này" (gán lại `room_id` cho thiết bị đã tồn tại) như §9.5 mô tả — hiện chỉ tạo được thiết bị mới qua Provisioning Wizard.
6. **`sensor_type` động hoàn toàn:** `SensorChart`/`DeviceDetailPage` vẫn giả định 2 field cố định `temperature`/`humidity` thay vì đọc động theo danh mục `sensor_type` như §9.6 mô tả đầy đủ — đã tổng quát hoá một phần (category-driven hiển thị chart) nhưng chưa tới mức hoàn toàn danh mục hoá.
