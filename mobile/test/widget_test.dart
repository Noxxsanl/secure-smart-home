import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

import 'package:smart_home_mobile/main.dart';

void main() {
  testWidgets('admin lands on home screen then can navigate to other pages', (
    tester,
  ) async {
    await tester.pumpWidget(const MyApp());

    await tester.enterText(
      find.widgetWithText(TextFormField, 'Email'),
      'admin@smarthome.local',
    );
    await tester.enterText(
      find.widgetWithText(TextFormField, 'Mật khẩu'),
      'admin123',
    );
    await tester.tap(find.text('ĐĂNG NHẬP'));
    await tester.pumpAndSettle();

    expect(find.text('Hello Admin'), findsOneWidget);
    expect(find.byType(BackButton), findsNothing);
    expect(find.text('Home'), findsOneWidget);
    expect(find.text('Room'), findsOneWidget);
    expect(find.text('Notifications'), findsOneWidget);
    expect(find.text('About'), findsOneWidget);
    expect(find.text('Profile'), findsOneWidget);

    await tester.tap(find.byKey(const ValueKey<String>('nav-Room')));
    await tester.pumpAndSettle();
    expect(find.text('Phòng khách'), findsOneWidget);
    expect(find.text('Phòng ngủ'), findsOneWidget);
    expect(find.text('Phòng bếp'), findsOneWidget);
    expect(find.text('Cửa'), findsOneWidget);
    expect(find.byType(BackButton), findsNothing);

    await tester.tap(
      find.byKey(const ValueKey<String>('nav-Notifications')),
    );
    await tester.pumpAndSettle();
    expect(find.text('Bạn chưa có thông báo mới.'), findsOneWidget);

    await tester.tap(find.byKey(const ValueKey<String>('nav-About')));
    await tester.pumpAndSettle();
    expect(find.text('Kết nối Bluetooth'), findsOneWidget);

    await tester.tap(find.byKey(const Key('connectBluetoothButton')));
    await tester.pump();
    expect(
      find.text(
        'Tính năng kết nối Bluetooth sẽ được hoàn thiện cùng OTA Gateway.',
      ),
      findsOneWidget,
    );
  });
}
