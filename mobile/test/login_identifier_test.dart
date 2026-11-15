import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:smart_home_mobile/app/app.dart';
import 'package:smart_home_mobile/core/config/app_config.dart';
import 'package:smart_home_mobile/core/storage/session_storage.dart';
import 'package:smart_home_mobile/mock/mock_backend.dart';
import 'package:smart_home_mobile/mock/mock_providers.dart';
import 'package:smart_home_mobile/modules/realtime/realtime.dart';

Widget _app() => ProviderScope(
  retry: (_, _) => null,
  overrides: [
    appConfigProvider.overrideWithValue(
      const AppConfig(apiBaseUrl: 'http://localhost:5000', useMock: true),
    ),
    sessionStorageProvider.overrideWithValue(MemorySessionStorage()),
    mockBackendProvider.overrideWithValue(MockBackend()),
    realtimeEnabledProvider.overrideWithValue(false),
  ],
  child: const SmartHomeApp(),
);

Future<void> _pump(WidgetTester tester) async {
  tester.view.physicalSize = const Size(1000, 3200);
  tester.view.devicePixelRatio = 1;
  addTearDown(tester.view.reset);
  await tester.pumpWidget(_app());
  await tester.pumpAndSettle();
}

Future<void> _submit(
  WidgetTester tester,
  String identifier, [
  String password = 'user123',
]) async {
  await tester.enterText(
    find.widgetWithText(TextFormField, 'Email hoặc mã người dùng'),
    identifier,
  );
  await tester.enterText(
    find.widgetWithText(TextFormField, 'Mật khẩu'),
    password,
  );
  await tester.tap(find.text('ĐĂNG NHẬP'));
  await tester.pumpAndSettle();
}

void main() {
  testWidgets('login accepts the user tag (any case, spaces around)', (
    tester,
  ) async {
    await _pump(tester);
    await _submit(tester, '  Dat#4821 ');
    expect(find.text('Nhà của Nguyễn Hoàng Đạt'), findsOneWidget);
    expect(find.text('Xin chào, Đạt'), findsOneWidget);
  });

  testWidgets('login with an unknown tag shows guidance, not a raw code', (
    tester,
  ) async {
    await _pump(tester);
    await _submit(tester, 'dat#0000');
    expect(
      find.textContaining('Email/mã người dùng hoặc mật khẩu không đúng'),
      findsOneWidget,
    );
    expect(find.textContaining('INVALID_CREDENTIALS'), findsNothing);
  });

  testWidgets('a staff tag cannot be used to sign in (staff have no tag)', (
    tester,
  ) async {
    await _pump(tester);
    await _submit(tester, 'admin#0001', 'admin123');
    expect(
      find.textContaining('Email/mã người dùng hoặc mật khẩu không đúng'),
      findsOneWidget,
    );
  });

  testWidgets('an empty identifier asks for email or user tag', (tester) async {
    await _pump(tester);
    await tester.tap(find.text('ĐĂNG NHẬP'));
    await tester.pumpAndSettle();
    expect(
      find.text('Vui lòng nhập email hoặc mã người dùng'),
      findsOneWidget,
    );
  });

  testWidgets('"Quên mật khẩu?" explains how to get access back', (
    tester,
  ) async {
    await _pump(tester);
    await tester.tap(find.byKey(const ValueKey<String>('login-forgot-password')));
    await tester.pumpAndSettle();

    expect(find.text('Quên mật khẩu'), findsOneWidget);
    expect(find.textContaining('chưa được hỗ trợ'), findsOneWidget);
    expect(find.textContaining('Hồ sơ → Đổi mật khẩu'), findsOneWidget);
    expect(find.textContaining('ten#1234'), findsOneWidget);
    expect(
      find.text('Nhân viên hỗ trợ không bao giờ hỏi mật khẩu của bạn.'),
      findsOneWidget,
    );

    await tester.tap(find.byKey(const ValueKey<String>('forgot-password-back')));
    await tester.pumpAndSettle();
    expect(find.text('Chào mừng quay trở lại!'), findsOneWidget);
  });
}
