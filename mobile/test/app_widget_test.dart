import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:smart_home_mobile/app/app.dart';
import 'package:smart_home_mobile/core/config/app_config.dart';
import 'package:smart_home_mobile/core/storage/session_storage.dart';
import 'package:smart_home_mobile/mock/mock_backend.dart';
import 'package:smart_home_mobile/mock/mock_providers.dart';
import 'package:smart_home_mobile/modules/devices/devices.dart';
import 'package:smart_home_mobile/modules/homes/features/claim/mobile_scanner_view.dart';
import 'package:smart_home_mobile/modules/homes/homes.dart';
import 'package:smart_home_mobile/modules/realtime/realtime.dart';

Widget _app({MemorySessionStorage? storage}) => ProviderScope(
  retry: (_, _) => null,
  overrides: [
    appConfigProvider.overrideWithValue(
      const AppConfig(apiBaseUrl: 'http://localhost:5000', useMock: true),
    ),
    sessionStorageProvider.overrideWithValue(storage ?? MemorySessionStorage()),
    mockBackendProvider.overrideWithValue(MockBackend()),
    realtimeEnabledProvider.overrideWithValue(false),
    // No camera in tests: a stand-in that "scans" a non-Smart-Home QR.
    qrScannerBuilderProvider.overrideWithValue(
      (context, onScanned, onFailure) => Center(
        child: TextButton(
          onPressed: () => onScanned('https://example.com'),
          child: const Text('fake-scan'),
        ),
      ),
    ),
  ],
  child: const SmartHomeApp(),
);

Future<void> _login(WidgetTester tester, String email, [String password = 'user123']) async {
  await tester.enterText(find.widgetWithText(TextFormField, 'Email'), email);
  await tester.enterText(find.widgetWithText(TextFormField, 'Mật khẩu'), password);
  await tester.tap(find.text('ĐĂNG NHẬP'));
  await tester.pumpAndSettle();
}

Future<void> _pump(WidgetTester tester, Widget app) async {
  tester.view.physicalSize = const Size(1000, 3200);
  tester.view.devicePixelRatio = 1;
  addTearDown(tester.view.reset);
  await tester.pumpWidget(app);
  await tester.pumpAndSettle();
}

void main() {
  testWidgets('starts on the login screen when there is no stored session', (
    tester,
  ) async {
    await _pump(tester, _app());
    expect(find.text('Chào mừng quay trở lại!'), findsOneWidget);
    expect(find.text('ĐĂNG NHẬP'), findsOneWidget);
    expect(find.text('Chưa có tài khoản? Đăng ký'), findsOneWidget);
  });

  testWidgets('wrong password shows Vietnamese guidance, not a raw code', (
    tester,
  ) async {
    await _pump(tester, _app());
    await _login(tester, 'user01@smarthome.local', 'sai-mat-khau');
    expect(find.textContaining('Email hoặc mật khẩu không đúng'), findsOneWidget);
    expect(find.textContaining('INVALID_CREDENTIALS'), findsNothing);
  });

  testWidgets('staff accounts are sent to the Web Dashboard', (tester) async {
    await _pump(tester, _app());
    await _login(tester, 'admin@smarthome.local', 'admin123');
    expect(find.textContaining('Web Dashboard'), findsOneWidget);
  });

  testWidgets('owner logs in, sees the home, controls a relay, opens tabs', (
    tester,
  ) async {
    await _pump(tester, _app());
    await _login(tester, 'user01@smarthome.local');

    expect(find.text('Nhà của Đạt'), findsOneWidget);
    expect(find.text('Xin chào, Đạt'), findsOneWidget);
    expect(find.text('Chủ nhà'), findsWidgets);
    expect(find.text('Gợi ý từ AI'), findsOneWidget);
    for (final label in ['Trang chủ', 'Phòng', 'Tự động', 'Thông báo', 'Hồ sơ']) {
      expect(find.byKey(ValueKey<String>('nav-$label')), findsOneWidget);
    }

    // First relay tile is "Đèn phòng khách" (on) → optimistic switch off.
    final firstSwitch = find.byType(Switch).first;
    expect(tester.widget<Switch>(firstSwitch).value, isTrue);
    await tester.tap(firstSwitch);
    await tester.pumpAndSettle();
    expect(tester.widget<Switch>(find.byType(Switch).first).value, isFalse);

    // Accepting the AI suggestion creates a rule (FR-7.5).
    await tester.tap(find.byKey(const ValueKey<String>('nav-Tự động')));
    await tester.pumpAndSettle();
    expect(find.text('Phòng ngủ nóng → bật quạt'), findsOneWidget);
    await tester.tap(find.text('Chấp nhận'));
    await tester.pumpAndSettle();
    expect(find.text('Bật Đèn phòng khách lúc 23:00'), findsNothing);
    expect(find.textContaining('Tắt Đèn phòng khách lúc 23:00'), findsOneWidget);

    await tester.tap(find.byKey(const ValueKey<String>('nav-Thông báo')));
    await tester.pumpAndSettle();
    expect(find.text('Cửa chính vừa được mở'), findsOneWidget);

    await tester.tap(find.byKey(const ValueKey<String>('nav-Hồ sơ')));
    await tester.pumpAndSettle();
    expect(find.text('Nguyễn Hoàng Đạt'), findsOneWidget);
    expect(find.text('Đăng xuất'), findsOneWidget);
  });

  testWidgets('named routes open pages owned by other modules', (tester) async {
    await _pump(tester, _app());

    // Login → register (auth).
    await tester.tap(find.text('Chưa có tài khoản? Đăng ký'));
    await tester.pumpAndSettle();
    expect(find.widgetWithText(AppBar, 'Đăng ký tài khoản'), findsOneWidget);
    await tester.pageBack();
    await tester.pumpAndSettle();

    await _login(tester, 'user01@smarthome.local');

    // Home dashboard → room detail (homes, RoomRouteArgs).
    await tester.tap(
      find.descendant(of: find.byType(RoomCard), matching: find.text('Phòng ngủ')),
    );
    await tester.pumpAndSettle();
    expect(find.widgetWithText(AppBar, 'Phòng ngủ'), findsOneWidget);

    // Room detail → device detail (devices, DeviceRouteArgs).
    await tester.tap(
      find.descendant(of: find.byType(DeviceRow), matching: find.text('Quạt phòng ngủ')),
    );
    await tester.pumpAndSettle();
    expect(find.widgetWithText(AppBar, 'Quạt phòng ngủ'), findsOneWidget);
    await tester.pageBack();
    await tester.pumpAndSettle();
    await tester.pageBack();
    await tester.pumpAndSettle();

    // Profile → members (homes, MembersRouteArgs).
    await tester.tap(find.byKey(const ValueKey<String>('nav-Hồ sơ')));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Thành viên'));
    await tester.pumpAndSettle();
    expect(find.widgetWithText(AppBar, 'Thành viên'), findsOneWidget);
  });

  testWidgets('VIEWER cannot switch relays and sees read-only automation', (
    tester,
  ) async {
    await _pump(tester, _app());
    await _login(tester, 'hoa@smarthome.local');

    expect(find.text('Chỉ xem'), findsWidgets);
    expect(tester.widget<Switch>(find.byType(Switch).first).onChanged, isNull);

    await tester.tap(find.byKey(const ValueKey<String>('nav-Tự động')));
    await tester.pumpAndSettle();
    expect(find.textContaining('Bạn chỉ có quyền xem'), findsOneWidget);
    expect(find.text('Tạo quy tắc'), findsNothing);
  });

  testWidgets('user without a home sees onboarding; wrong QR is rejected', (
    tester,
  ) async {
    await _pump(tester, _app());
    await _login(tester, 'kimanh@smarthome.local');

    expect(find.text('Bạn chưa có Smart Home nào'), findsOneWidget);
    expect(find.byKey(const ValueKey<String>('onboarding-invitations')), findsOneWidget);

    await tester.tap(find.byKey(const ValueKey<String>('onboarding-claim')));
    await tester.pumpAndSettle();
    await tester.tap(find.text('fake-scan'));
    await tester.pumpAndSettle();
    expect(find.textContaining('Mã QR không phải của Smart Home'), findsOneWidget);

    // Manual entry: lower-case, O/I/L typed → normalised, then claimed.
    await tester.tap(find.text('Nhập mã thủ công'));
    await tester.pumpAndSettle();
    await tester.enterText(
      find.byKey(const ValueKey<String>('activation-code-field')),
      '7k2m9qxa4tpb',
    );
    await tester.pump();
    expect(find.text('7K2M-9QXA-4TPB'), findsOneWidget);
    await tester.tap(find.text('XÁC NHẬN'));
    await tester.pumpAndSettle();
    expect(find.text('Bạn là chủ nhà'), findsOneWidget);
    expect(find.textContaining('WiFi cho Gateway'), findsOneWidget);

    await tester.tap(find.text('Vào nhà của tôi'));
    await tester.pumpAndSettle();
    expect(find.text('Kit KIT_A #0003'), findsOneWidget);
  });

  testWidgets('a used activation code explains what to do next', (tester) async {
    await _pump(tester, _app());
    await _login(tester, 'kimanh@smarthome.local');
    await tester.tap(find.byKey(const ValueKey<String>('onboarding-claim')));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Nhập mã thủ công'));
    await tester.pumpAndSettle();
    await tester.enterText(
      find.byKey(const ValueKey<String>('activation-code-field')),
      'q4zt6mjk1psx',
    );
    await tester.tap(find.text('XÁC NHẬN'));
    await tester.pumpAndSettle();
    expect(find.textContaining('đã được sử dụng'), findsOneWidget);
  });

  testWidgets('GUEST accepts an invitation and gets an automation explanation', (
    tester,
  ) async {
    await _pump(tester, _app());
    await _login(tester, 'minh@smarthome.local');

    await tester.tap(find.byKey(const ValueKey<String>('onboarding-invitations')));
    await tester.pumpAndSettle();
    expect(find.text('Nhà của Đạt'), findsOneWidget);
    await tester.tap(find.byType(FilledButton).first);
    await tester.pumpAndSettle();
    // Back on the root: the user now has a home → shell.
    Navigator.of(tester.element(find.byType(Scaffold).first))
        .popUntil((route) => route.isFirst);
    await tester.pumpAndSettle();
    expect(find.byKey(const ValueKey<String>('nav-Trang chủ')), findsOneWidget);

    await tester.tap(find.byKey(const ValueKey<String>('nav-Tự động')));
    await tester.pumpAndSettle();
    expect(find.text('Khách không xem được tự động hoá'), findsOneWidget);
  });
}
