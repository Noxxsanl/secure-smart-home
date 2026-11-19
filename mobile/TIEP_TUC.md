# Mobile — làm tiếp (bàn giao 2026-11-16)

App Flutter `mobile/` đã được sửa để chạy giống web `frontend/apps/user`. Đã commit + push lên `develop` (2026-11-16,
3 commit: backend camera mobile + nginx · mobile · tài liệu). Mọi kiểm tra tĩnh đều xanh;
**chưa chạy app trên máy ảo/điện thoại với backend thật và phần cứng**.

## 1. Đã làm

| Phần | Mobile hiện có |
|---|---|
| Điều hướng | 4 tab: Trang chủ · Tự động · **[Mic]** · Thông báo · Hồ sơ. Nút mic nằm giữa thanh nav (mép thanh nhô cong lên). Đã bỏ tab Phòng |
| Trang chủ | Thống kê, gợi ý, **Điều khiển nhanh** (nút "Tất cả thiết bị"), mục **Camera** (thẻ ảnh mới nhất + nút "Xem trực tiếp" — mở trang camera và phát luôn). Đã bỏ mục Phòng |
| Thiết bị | Loại đồ vật theo backend (`appliance`); rèm 3 mức Đóng/50%/100% (`set_pos`); điều hoà đặt 16–30 °C (bấm nhanh gộp 1 lệnh), lưới 16 mã IR + Học mã (`learn_code`). Trang **Thiết bị** (nhóm theo phòng, lọc); chạm tên phòng → chi tiết phòng |
| Hẹn giờ (FR-5.10) | Tab Tự động có 2 tab con "Hẹn giờ \| Tự động hoá"; thêm "Lúc HH:MM"/"Sau N phút", huỷ, lịch sử; mục "Hẹn giờ" ở chi tiết thiết bị; giờ theo múi giờ nhà |
| Trợ lý AI (FR-7.x) | **Giữ mic để nói, thả để gửi** (giữ ~0,3 s; kéo xa ~80 dp rồi thả = huỷ; chạm nhanh = mở khung Trợ lý). Gõ chữ, thẻ Cần xác nhận / Đã làm / Đã hẹn (huỷ được). Ghi âm bằng package `record` ^7.2.0 (WAV trong RAM, ≤ 30 s) |
| Camera (FR-5.8) | Xem trực tiếp + ảnh chụp như web. Backend mới: WebSocket `/api/mobile/cameras/:id/live` (khung đầu `{"type":"auth","token"}`) |
| Đăng nhập | Email **hoặc mã người dùng** (`ten#1234`); màn Quên mật khẩu |
| Dữ liệu giả | `user01` có đúng 1 nhà **"Nhà của Nguyễn Hoàng Đạt"** giống web: phòng **Phòng khách** (cảm biến, đèn, quạt, rèm, điều hoà) + phòng **Camera**; ảnh chụp mẫu + luồng xem trực tiếp mô phỏng (chỉ khi `USE_MOCK=true`) |
| Hạ tầng | nginx cổng 80: `/api/agent/` chỉ chuyển sang agent khi có `Authorization: Bearer` (cho mobile) |

Tài liệu đã cập nhật: `mobile/README.md`, `CLAUDE.md`, `docs/API_DESIGN.md`, `docs/PRD_SMART_HOME.md`,
`docs/guides/CHAY_LOCAL.md`, `docs/guides/LEN_SERVER.md`, `agent/README.md`.

## 2. Kết quả kiểm tra (đã chạy thật)

- `cd mobile && flutter analyze` → sạch · `dart run tool/check_architecture.dart` → OK 193 file · `flutter test` → **236 pass**.
- `cd backend && npx tsc --noEmit && npm run check:arch` → sạch.
- `docker compose exec nginx nginx -t` → OK.
- Backend thật (Docker, dữ liệu của bạn), gọi đúng như app qua `http://localhost` (nginx):
  - đăng nhập mobile `user01` → 200; nhà "Nhà của Nguyễn Hoàng Đạt" đúng bố cục ở trên;
  - ảnh chụp camera → 200 nhưng **chưa có ảnh nào**;
  - xem trực tiếp → xác thực OK → `connecting` → `camera_unavailable` → đóng **4408** vì **Gateway đang offline**.

## 3. Việc ngày mai (theo thứ tự)

1. **Bật hệ thống**: ở thư mục gốc `docker compose up -d`, đợi `curl http://localhost/api/health` trả 200.
2. **Bật phần cứng**: cấp nguồn Gateway S3 + ESP32-CAM + Node; chúng phải trỏ về IP máy này
   (`docs/guides/LEN_SERVER.md`: cert theo IP, NVS `cloud/*`). Mở web user kiểm Gateway **online**.
3. **Chuẩn bị máy ảo (1 lần)**:
   - bật Developer Mode của Windows: `start ms-settings:developers` (Flutter cần symlink cho plugin; trước đó báo lỗi khi chạy);
   - `flutter doctor --android-licenses` (gõ `y`);
   - Android Studio → Device Manager → tạo Pixel 8, API 35, Google APIs, x86_64 (máy hiện chưa có máy ảo nào).
4. **Chạy app** trong VS Code (Run and Debug, `Ctrl+Shift+D`, chọn máy ảo ở góc phải thanh trạng thái — KHÔNG chọn Windows):
   - **"Mobile — Docker qua nginx :80, có Trợ lý (máy ảo)"** → backend thật, có Trợ lý;
   - "Mobile — dữ liệu giả (không cần backend)" → thử nhanh không cần Docker.
   Đăng nhập `user01@smarthome.local` / `user123`. Lần build đầu Gradle mất vài phút; **Android chưa build lần nào
   với package `record`** — lỗi Gradle thì gửi log.
5. **Kiểm trên máy**:
   - [ ] Trang chủ → Camera → "Xem trực tiếp" ra hình thật (cần Gateway + camera online).
   - [ ] Ảnh chụp hiện khi camera phát hiện chuyển động.
   - [ ] Rèm 0/50/100 %, điều hoà −/+, học mã IR với Node thật.
   - [ ] Hẹn giờ "Sau 1 phút" chạy đúng, thông báo về.
   - [ ] Trợ lý: cần `OPENAI_API_KEY` trong `agent/.env` rồi `docker compose up -d agent`. Micro máy ảo: cửa sổ máy ảo
         ⋮ → Microphone → bật "Virtual microphone uses host audio input"; lần đầu bấm giữ mic → cho phép quyền.
   - [ ] Cảm giác giữ mic (0,3 s, ngưỡng huỷ 80 dp), hình phần nhô của thanh nav — muốn chỉnh thì sửa
         `lib/modules/ai/ui/hold_to_talk_mic.dart` và `lib/app/shell/bottom_nav_bar.dart`.
6. Sửa gì sau khi thử trên máy thì commit tiếp lên `develop`.

## 4. Còn tồn (mức thấp, chưa sửa)

- Dev chưa bật `TRUST_PROXY` → mọi client qua nginx chung 1 IP cho giới hạn tốc độ (log backend có cảnh báo
  `ERR_ERL_UNEXPECTED_X_FORWARDED_FOR`); prod đã bật. Có từ trước.
- Bấm −/+ điều hoà khi đang có lệnh khác chạy thì bị bỏ qua không báo (nút đã khoá nên hiếm gặp).
- 2 câu tài liệu cũ chưa sửa: `docs/proposals/DE_XUAT_AI_AGENT.md:673`, `docs/SECURITY_ARCHITECTURE.md:140`.
- Popup hệ điều hành khi app chạy nền chưa có (cần FCM, PRD để V4). Khi app đang mở, thông báo mới hiện thanh "Xem".

## 5. Lệnh chạy nhanh (terminal)

```bash
cd mobile
flutter run --dart-define=USE_MOCK=true                        # dữ liệu giả
flutter run --dart-define=API_BASE_URL=http://10.0.2.2         # máy ảo → Docker qua nginx (có Trợ lý)
flutter run --dart-define=API_BASE_URL=http://10.0.2.2:5000 \
            --dart-define=AGENT_BASE_URL=http://10.0.2.2:8000/v1   # backend + agent chạy tay
flutter run --dart-define=API_BASE_URL=http://<IP-LAN>         # điện thoại thật cùng Wi-Fi
flutter analyze && dart run tool/check_architecture.dart && flutter test
```

Cấu hình VS Code nằm ở `.vscode/launch.json` (thư mục `.vscode` bị git bỏ qua — chỉ có trên máy này).

## 6. File chính

| Chỗ | File |
|---|---|
| Thanh nav + mic giữa | `lib/app/shell/bottom_nav_bar.dart`, `app_shell_page.dart`, `lib/modules/ai/features/assistant/assistant_nav_mic.dart`, `lib/modules/ai/ui/hold_to_talk_mic.dart` |
| Trợ lý | `lib/modules/ai/**`, `lib/core/network/api_client.dart` (`postUrl`/`postBytesUrl`, chỉ gửi Bearer tới origin đã cấu hình), `lib/core/config/app_config.dart` (`AGENT_BASE_URL`) |
| Camera | `lib/modules/devices/{data/camera_live_ws_source.dart, data/camera_live_mock_source.dart, ui/camera_card.dart, features/device_detail/camera_live_view.dart}`; backend `backend/src/modules/camera/features/live-relay/{live-mobile-viewer.controller.ts, live-viewer.run.ts}` |
| Thiết bị | `lib/modules/devices/{domain/device_command.dart, ac_codes.dart, curtain.dart, ui/device_list_view.dart, features/device_list/}`, `lib/modules/homes/application/homes_providers.dart` |
| Hẹn giờ | `lib/modules/automation/{domain/schedule*.dart, data/schedule_*, application/schedule_providers.dart, ui/*schedule*, features/schedules/}` |
| Giờ theo nhà | `lib/core/utils/home_time.dart` |
| Dữ liệu giả | `lib/mock/mock_backend.dart`, `lib/core/utils/png_encoder.dart` |
| nginx | `infra/nginx/nginx.conf` (khối `/api/agent/` của server mặc định cổng 80) |
