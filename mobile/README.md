# mobile — app Flutter cho khách hàng (USER)

App của khách hàng, chạy giống web user (`frontend/apps/user`, cập nhật 2026-11-15): đăng nhập bằng email hoặc mã
người dùng (có màn Quên mật khẩu), xem/điều khiển nhà, phòng, thiết bị (đèn, quạt, rèm 3 mức, điều hoà 16–30 °C + học
mã IR), **hẹn giờ một lần** (FR-5.10), tự động hoá, **camera xem trực tiếp** (FR-5.8), **Trợ lý AI giọng nói/chữ**
(FR-7.x, nút mic giữa thanh điều hướng — giữ để nói), thông báo, thành viên, claim Smart Home. Gọi `/api/mobile/**`, WebSocket `/api/mobile/ws` và
`/api/mobile/cameras/:id/live`, riêng Trợ lý gọi dịch vụ `agent/` qua `/api/agent/` (nginx); **không kết nối MQTT**
(bất biến 7). Chưa chạy trên máy thật/backend thật/OpenAI thật/phần cứng — mới kiểm tĩnh và test trên backend giả.
Stack: Flutter, Riverpod (DI + state), `http`, `flutter_secure_storage`, `web_socket_channel`, `mobile_scanner`,
`record` (ghi âm cho Trợ lý).
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
│   ├── shell/             # app_shell_page (4 tab + nút mic Trợ lý ở giữa thanh), bottom_nav_bar (mép thanh nhô cong ôm nút), shell_providers (tab đang chọn)
│   └── realtime_controller.dart   # 1 chỗ nhận sự kiện WS rồi đổ vào notifier của các module; poll 15 s khi WS rớt
├── core/                  # không phụ thuộc module
│   ├── config/            # AppConfig: USE_MOCK, API_BASE_URL, AGENT_BASE_URL (--dart-define)
│   ├── navigation/        # app_routes.dart — tên route + tham số + AppNavigation (openClaim, openDevice…)
│   ├── network/           # api_client (Bearer + refresh token xoay vòng; postUrl/postBytesUrl gọi agent), api_exception, error_messages (tiếng Việt)
│   ├── realtime/          # realtime_source — WebSocket + backoff 1→30 s
│   ├── storage/           # session_storage (flutter_secure_storage)
│   ├── theme/ utils/ widgets/   # utils/home_time.dart: giờ theo múi giờ NHÀ (hẹn giờ, Trợ lý); utils/png_encoder.dart: mã hoá PNG thuần Dart cho ảnh camera giả
├── mock/                  # backend giả trong bộ nhớ cho --dart-define=USE_MOCK=true và test (user01: 1 nhà "Nhà của Nguyễn Hoàng Đạt" giống nhà demo của web — Phòng khách + Camera)
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
├── ui/                    # widget dùng ở ≥ 2 feature hoặc module khác (DeviceTile, CameraCard, SuggestionCard…)
└── features/<feature>/    # một màn hình: trang + widget/sheet/màn con chỉ nó mở
```

## 2. Module

| Module | Web / backend tương ứng | Feature | Công khai qua barrel (ngoài entity, provider) |
|---|---|---|---|
| `auth` | `@shh/auth` / `identity` | `splash`, `login` (email hoặc mã người dùng `ten#1234`, gồm màn Quên mật khẩu — chưa tự đặt lại được), `register`, `profile` (gồm sửa hồ sơ, đổi mật khẩu, giới thiệu) | — |
| `homes` | `@shh/homes` / `homes` | `onboarding`, `home_dashboard` (gồm sheet đổi nhà; mục "Điều khiển nhanh" + mục **Camera**, không còn lưới phòng), `room_detail`, `members` (gồm mời thành viên), `my_invitations`, `claim` (gồm quét QR) | `roomIcon`, mapper nhà/phòng |
| `devices` | `@shh/devices` + `@shh/telemetry` / `devices` + `telemetry` + `control` + `camera` | `device_list` (trang "Thiết bị" mở từ Trang chủ, `AppRoutes.deviceList`), `device_detail` (gồm biểu đồ telemetry; điều khiển theo loại đồ vật lấy từ `appliance` của backend — rèm Đóng/50%/100% `set_pos`, điều hoà 16–30 °C `set_temp` + lưới 16 mã IR và Học mã `learn_code`; mục "Hẹn giờ"; khối "Ảnh camera" cho `category == camera`: ảnh mới nhất 4:3 + dải thumbnail qua `ApiClient.getBytes` có Bearer, làm mới khi WS `camera_snapshot`; khối "Xem trực tiếp": WebSocket `/api/mobile/cameras/:id/live`, `data/camera_live_ws_source.dart`; ở `USE_MOCK` nguồn giả `data/camera_live_mock_source.dart` phát khung ~5 hình/giây) | `DeviceTile`, `DeviceRow`, `CameraCard` (thẻ camera ở Trang chủ: ảnh mới nhất 4:3, trạng thái, "Xem trực tiếp"), `DeviceListView` (màn Thiết bị: nhóm theo phòng — chạm tên phòng mở chi tiết phòng —, lọc Tất cả/Đang bật/Offline), nhãn/biểu tượng thiết bị, `togglePower` + lệnh rèm/điều hoà/học mã, mapper thiết bị |
| `automation` | `@shh/automation` / `automation` + `recommendations` + `schedules` | `rules` (danh sách + tạo quy tắc + lịch sử), `schedules` (**hẹn giờ một lần**: Sắp chạy / Lịch sử, thêm, huỷ; giờ theo múi giờ nhà) | `SuggestionCard` (trang chủ), mục "Hẹn giờ" ở chi tiết thiết bị, sheet tạo hẹn giờ, mapper `Schedule` |
| `notifications` | `@shh/notifications` / `notifications` | `notification_center` | mapper thông báo |
| `ai` | `@shh/ai` / `agent` (+ dịch vụ `agent/`) | `assistant` (nút mic giữa thanh nav — chạm mở, giữ để nói — + sheet Trợ lý: gõ chữ hoặc giữ mic để nói, thẻ xác nhận/từ chối, danh sách đã chạy/đã hẹn/bị bỏ qua) | provider Trợ lý, `AgentReply`, mapper |
| `realtime` | — / `realtime` | — (chỉ nguồn WS/mock + kiểu sự kiện `RealtimeEvent`) | `realtimeSourceProvider`, `parseRealtimeEvent` |

Phụ thuộc giữa module (qua barrel; kiểm bằng grep import thật): `homes` → auth, devices, automation, notifications,
realtime · `devices` → auth, homes, automation (mục "Hẹn giờ" ở chi tiết thiết bị) · `automation` → auth, devices,
homes · `ai` → auth, homes, devices, automation, notifications · `notifications` → auth, homes · `auth` → homes ·
`realtime` → devices, notifications. Vòng import (vd homes ↔ devices) hợp lệ trong Dart.

Điều hướng (4 tab đáy, key `nav-<nhãn>`): Trang chủ · **Tự động** (tab con "Hẹn giờ | Tự động hoá") · Thông báo · Hồ sơ;
**giữa thanh là nút mic Trợ lý** (module `ai`, `AssistantNavMic`; mép thanh nhô cong lên ôm nút, key `assistant-mic`). Chạm
nhanh → mở sheet Trợ lý của nhà đang chọn; **giữ ≥ 300 ms để nói** (rung nhẹ, bong bóng "Đang nghe… 0:04 / 0:30"), thả tay để gửi
rồi mở sheet xem câu trả lời, kéo ngón tay xa ≥ 80 dp rồi thả để huỷ; ghi < 0,6 s thì bỏ; tự gửi ở 30 s. Mic trong sheet dùng cùng
cách giữ-để-nói. Không có tab "Phòng" và Trang chủ không còn mục "Phòng": dưới "Điều khiển nhanh" là mục **Camera** (mỗi camera một thẻ: ảnh chụp mới nhất, tên, online/ngoại tuyến, nút "Xem trực tiếp" mở trang camera và tự phát; chạm phần còn lại của thẻ chỉ mở trang). "Tất cả thiết bị" (ở mục Điều khiển nhanh) mở trang Thiết bị, nơi chạm tên phòng mở chi tiết phòng (đổi tên phòng, nhiệt/ẩm).
Thông báo WS `SCHEDULE_*` / `AGENT_SCHEDULED` làm mới danh sách hẹn giờ của nhà (`app/realtime_controller.dart`).

Trợ lý AI: gọi agent tại `AGENT_BASE_URL` (mặc định `<API_BASE_URL>/api/agent`, qua nginx cổng 80, header Bearer);
ghi âm PCM 16 kHz → WAV trong RAM (≤ 30 giây, ≤ 1 MB, không lưu file, không log nội dung); xác nhận/từ chối qua
`/api/mobile/agent/requests/:id/confirm|reject`; token hết hạn (agent trả 401 `SESSION_EXPIRED`) → refresh rồi gửi lại
đúng 1 lần. Gọi thẳng backend `:5000` thì `/api/agent` không tồn tại → app báo Trợ lý chưa sẵn sàng.

Route có tên (`core/navigation/app_routes.dart`) — chỉ cho màn hình mở từ feature khác:

| Route | Tham số | Module dựng trang | Mở từ |
|---|---|---|---|
| `register` | — | auth | login |
| `claim` | — | homes | onboarding, sheet đổi nhà, hồ sơ |
| `myInvitations` | — | homes | onboarding, sheet đổi nhà, hồ sơ |
| `members` | `({int homeId})` | homes | hồ sơ |
| `roomDetail` | `({int homeId, int roomId})` | homes | trang Thiết bị (chạm tên phòng) |
| `deviceDetail` | `({int homeId, int deviceId})` | devices | trang chủ (thẻ camera), chi tiết phòng |
| `cameraLive` | `({int homeId, int deviceId})` | devices | trang chủ (nút "Xem trực tiếp": mở trang camera và tự phát) |

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
- **Dữ liệu giả** (`mock/mock_backend.dart`): `user01@smarthome.local` có đúng một nhà "Nhà của Nguyễn Hoàng Đạt" như nhà demo của web
  (`npm run hw:register`): Gateway S3, phòng "Phòng khách" (cảm biến nhiệt/ẩm, đèn, quạt, rèm, điều hòa) và phòng "Camera"
  (camera). Thành viên Lan (CONTROLLER), Hoa (VIEWER), lời mời GUEST cho Minh (chỉ đèn phòng khách), quy tắc, gợi ý, thông báo,
  hẹn giờ mẫu đều dùng thiết bị phòng khách. Nhà Quận 7 của Hùng, nhà chưa kích hoạt + mã claim giữ để thử các luồng khác.
  Camera giả có 5 ảnh chụp mẫu (`listSnapshots`/`snapshotImage`) và "Xem trực tiếp" mô phỏng (`CameraLiveMockSource`, ~5 hình/giây);
  ảnh vẽ bằng Dart thuần rồi mã hoá PNG, không dùng `dart:ui`/`dart:io`, nên chạy được trong widget test.
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
flutter test                                  # 236 test (đơn vị + widget, chạy trên backend giả)
flutter run --dart-define=USE_MOCK=true       # không cần backend
flutter run --dart-define=API_BASE_URL=http://<LAN-IP>:5000   # backend thật, origin không kèm /api (Trợ lý chưa sẵn sàng)
flutter run --dart-define=API_BASE_URL=http://<LAN-IP>        # qua nginx cổng 80 của Docker: có cả Trợ lý (/api/agent, chỉ khi có Bearer)
# Máy ảo Android + backend :5000 + agent chạy tay: gọi thẳng agent dev
flutter run --dart-define=AGENT_BASE_URL=http://10.0.2.2:8000/v1
```

Quyền micro: Android `RECORD_AUDIO` (`AndroidManifest.xml`), iOS `NSMicrophoneUsageDescription` (`Info.plist`);
app xin quyền lần đầu bấm mic.

Chạy với backend local, tài khoản demo: `docs/guides/CHAY_LOCAL.md`.
