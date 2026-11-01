# mobile — app Flutter cho khách hàng (USER)

App của khách hàng: đăng nhập, xem/điều khiển nhà, phòng, thiết bị, tự động hoá, thông báo, thành viên, claim
Smart Home. Chỉ gọi `/api/mobile/**` và WebSocket `/api/mobile/ws`, **không kết nối MQTT** (bất biến 7). Stack:
Flutter, Riverpod (DI + state), `http`, `flutter_secure_storage`, `web_socket_channel`, `mobile_scanner`.
Kiến trúc đích: `docs/architecture/MOBILE_APP_ARCHITECTURE.md`; hợp đồng API: `docs/API_DESIGN.md`.

Bố cục **module → feature** giống backend (`backend/src/modules/README.md`) và web (`frontend/README.md`):
mỗi domain là một module, trong module mỗi màn hình (ca sử dụng) là một feature. Quy tắc phụ thuộc được kiểm tự
động bằng `dart run tool/check_architecture.dart` (chạy trong CI cùng `flutter analyze` và `flutter test`).

## 1. Bố cục

```
lib/
├── main.dart              # ProviderScope + SmartHomeApp
├── app/                   # composition root — nơi DUY NHẤT biết trang của mọi module
│   ├── app.dart           # MaterialApp: theme, home = AppRoot, onGenerateRoute
│   ├── router.dart        # ghép route của các module (authRoute ?? homesRoute ?? devicesRoute)
│   ├── app_root.dart      # splash → đăng nhập → (chưa có nhà) onboarding → shell
│   ├── shell/             # app_shell_page (5 tab), bottom_nav_bar, shell_providers (tab đang chọn)
│   └── realtime_controller.dart   # 1 chỗ nhận sự kiện WS rồi đổ vào notifier của các module; poll 15 s khi WS rớt
├── core/                  # không phụ thuộc module
│   ├── config/            # AppConfig: USE_MOCK, API_BASE_URL (--dart-define)
│   ├── navigation/        # app_routes.dart — tên route + tham số + AppNavigation (openClaim, openDevice…)
│   ├── network/           # api_client (Bearer + refresh token xoay vòng), api_exception, error_messages (tiếng Việt)
│   ├── realtime/          # realtime_source — WebSocket + backoff 1→30 s
│   ├── storage/           # session_storage (flutter_secure_storage)
│   ├── theme/ utils/ widgets/
├── mock/                  # backend giả trong bộ nhớ cho --dart-define=USE_MOCK=true và test
└── modules/<m>/           # xem §2
```

Một module:

```
modules/<m>/
├── <m>.dart               # barrel — cửa ra DUY NHẤT cho module khác: domain/, application/, ui/ (+ mapper hợp đồng)
├── <m>_module.dart        # trang mà app/ nhúng (tab, root) + <m>Route(RouteSettings) — CHỈ app/ import
├── domain/                # entity, repository interface, logic thuần (mô tả rule, chuẩn hoá mã claim…)
├── data/                  # *_mapper.dart (JSON ↔ entity), *_remote_repository.dart, *_mock_repository.dart
├── application/           # provider Riverpod: chọn remote/mock theo AppConfig.useMock + notifier dùng chung
├── ui/                    # widget dùng ở ≥ 2 feature hoặc module khác (DeviceTile, RoomCard, SuggestionCard…)
└── features/<feature>/    # một màn hình: trang + widget/sheet/màn con chỉ nó mở
```

## 2. Module

| Module | Web / backend tương ứng | Feature | Công khai qua barrel (ngoài entity, provider) |
|---|---|---|---|
| `auth` | `@shh/auth` / `identity` | `splash`, `login`, `register`, `profile` (gồm sửa hồ sơ, đổi mật khẩu, giới thiệu) | — |
| `homes` | `@shh/homes` / `homes` | `onboarding`, `home_dashboard` (gồm sheet đổi nhà), `room_list`, `room_detail`, `members` (gồm mời thành viên), `my_invitations`, `claim` (gồm quét QR) | `RoomCard`, `roomIcon`, mapper nhà/phòng |
| `devices` | `@shh/devices` + `@shh/telemetry` / `devices` + `telemetry` + `control` | `device_detail` (gồm biểu đồ telemetry) | `DeviceTile`, `DeviceRow`, nhãn/biểu tượng thiết bị, `togglePower`, mapper thiết bị |
| `automation` | `@shh/automation` / `automation` + `recommendations` | `rules` (danh sách + tạo quy tắc + lịch sử) | `SuggestionCard` (dùng ở trang chủ) |
| `notifications` | `@shh/notifications` / `notifications` | `notification_center` | mapper thông báo |
| `realtime` | — / `realtime` | — (chỉ nguồn WS/mock + kiểu sự kiện `RealtimeEvent`) | `realtimeSourceProvider`, `parseRealtimeEvent` |

Phụ thuộc giữa module (qua barrel): `homes` → auth, devices, automation, notifications, realtime ·
`devices` → auth, homes · `automation` → auth, devices, homes · `notifications` → auth, homes ·
`auth` → homes · `realtime` → devices, notifications. Vòng import (vd homes ↔ devices) hợp lệ trong Dart.

Route có tên (`core/navigation/app_routes.dart`) — chỉ cho màn hình mở từ feature khác:

| Route | Tham số | Module dựng trang | Mở từ |
|---|---|---|---|
| `register` | — | auth | login |
| `claim` | — | homes | onboarding, sheet đổi nhà, hồ sơ |
| `myInvitations` | — | homes | onboarding, sheet đổi nhà, hồ sơ |
| `members` | `({int homeId})` | homes | hồ sơ |
| `roomDetail` | `({int homeId, int roomId})` | homes | trang chủ, danh sách phòng |
| `deviceDetail` | `({int homeId, int deviceId})` | devices | trang chủ, chi tiết phòng |

## 3. Quy tắc phụ thuộc (`dart run tool/check_architecture.dart`)

| Mã | Quy tắc |
|---|---|
| A1 | Tầng: `core/` → core · `mock/` → core, mock, barrel module · `modules/` → core, mock (chỉ từ `data/`, `application/`), module khác qua barrel · `app/` → core, app, barrel + `<m>_module.dart` (không dùng mock — chọn nguồn là việc của `application/`). Chỉ `main.dart` và `app/` được import `app/`. |
| A2 | Module khác chỉ qua `modules/<m>/<m>.dart`. `<m>_module.dart` chỉ `app/` import. Trong module import thẳng file, không đi vòng qua barrel của chính mình. |
| A3 | Trong module: `domain/` → domain (+ `core/utils/`) · `data/` → domain, data · `application/` → domain, data, application · `ui/` → domain, application, ui · `features/<f>` → domain, application, ui, chính nó. Barrel chỉ export `domain/`, `application/`, `ui/` và `data/*_mapper.dart` (không công khai repository). |
| A4 | Feature không import feature khác, kể cả cùng module. Màn con chỉ mở từ một màn → để chung feature; mở từ nhiều nơi → route có tên. |
| A5 | Trong `lib/` dùng đường dẫn tương đối, không `package:smart_home_mobile/`. |
| A6 | Không package MQTT (bất biến 7). |

`test/` không bị kiểm: test được import thẳng file nội bộ (mapper, formatter, provider để override), nhưng ưu tiên
barrel khi thứ cần đã công khai.

So với khuôn `presentation/{pages,widgets,providers}` cũ: `presentation/providers` → `application/`,
widget dùng chung → `ui/`, trang + widget riêng → `features/<f>/`; `shell/` → `app/`; `rooms`, `members`, `claim`
gộp vào `homes`, `profile` gộp vào `auth` (cùng ranh giới với backend và web). Điều hướng bằng `Navigator` sẵn có;
`go_router` (Mobile §4.1) vẫn là đích — đổi sẽ chỉ chạm `core/navigation` + `<m>Route` + `app/router.dart`.

## 4. Quy ước

- **Repository**: interface ở `domain/`, `Remote*` + `Mock*` ở `data/`; provider ở `application/` chọn theo
  `ref.watch(appConfigProvider).useMock`. Feature mới luôn kèm mock để app chạy khi không có backend.
- **State**: `AsyncNotifier`/`Notifier` + `.family`/`.autoDispose` trong `application/`; màn hình chỉ `watch`.
  Nhà đang chọn + overview: `homesProvider`, `currentHomeProvider`, `homeOverviewProvider` (homes).
- **Realtime**: sự kiện WS chỉ vào `app/realtime_controller.dart` → gọi `applyDeviceState`/`applyTelemetry`/
  `invalidate` của notifier tương ứng (`docs/DESIGN_PATTERNS.md` §5.2a).
- **Lỗi**: `ApiException` → `userMessageFor` (`core/network/error_messages.dart`) — luôn câu tiếng Việt có hướng dẫn,
  không hiện mã thô. Relay optimistic + hoàn tác khi hết thời gian chờ (FR-5.3); offline → khoá nút + "online lần cuối".
- **Bí mật**: token chỉ trong `session_storage`; không log token/mật khẩu (bất biến 2).
- **Test** override qua `ProviderScope`: `appConfigProvider`, `sessionStorageProvider`, `mockBackendProvider`,
  `realtimeEnabledProvider`, `qrScannerBuilderProvider` (không có camera), `<x>RepositoryProvider`.

## 5. Thêm feature / module / route

1. Màn hình mới → `modules/<m>/features/<ten_feature>/<ten>_page.dart`; provider mới → `application/`; widget mà
   feature khác cũng cần → `ui/` và export trong `<m>.dart`.
2. Màn hình được mở từ feature khác → thêm hằng + `typedef` tham số + hàm `open…` trong
   `core/navigation/app_routes.dart`, thêm nhánh trong `<m>Route` của `<m>_module.dart` (module chưa có thì tạo
   hàm và nối vào `app/router.dart`).
3. Tab/trang gốc mới → export trang trong `<m>_module.dart`, nhúng ở `app/shell` hoặc `app/app_root.dart`.
4. Module mới → `modules/<m>/{<m>.dart, domain, data, application}` theo §1; chỉ thêm `<m>_module.dart` khi có trang.
5. `flutter analyze && dart run tool/check_architecture.dart && flutter test`.

## 6. Lệnh

```bash
cd mobile
flutter pub get
flutter analyze
dart run tool/check_architecture.dart
flutter test                                  # 48 test (đơn vị + widget, chạy trên backend giả)
flutter run --dart-define=USE_MOCK=true       # không cần backend
flutter run --dart-define=API_BASE_URL=http://<LAN-IP>:5000   # backend thật, origin không kèm /api
```

Chạy với backend local, tài khoản demo: `docs/guides/CHAY_LOCAL.md`.
