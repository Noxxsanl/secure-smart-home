import 'dart:typed_data';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_riverpod/misc.dart' show Override;
import 'package:flutter_test/flutter_test.dart';
import 'package:smart_home_mobile/app/app.dart';
import 'package:smart_home_mobile/core/config/app_config.dart';
import 'package:smart_home_mobile/core/storage/session_storage.dart';
import 'package:smart_home_mobile/core/utils/png_encoder.dart';
import 'package:smart_home_mobile/core/widgets/app_widgets.dart';
import 'package:smart_home_mobile/mock/mock_backend.dart';
import 'package:smart_home_mobile/mock/mock_providers.dart';
import 'package:smart_home_mobile/modules/devices/data/device_mock_repository.dart';
import 'package:smart_home_mobile/modules/devices/devices.dart';
import 'package:smart_home_mobile/modules/realtime/realtime.dart';

Widget _app(MockBackend backend, {List<Override> overrides = const []}) =>
    ProviderScope(
      retry: (_, _) => null,
      overrides: [
        appConfigProvider.overrideWithValue(
          const AppConfig(apiBaseUrl: 'http://localhost:5000', useMock: true),
        ),
        sessionStorageProvider.overrideWithValue(MemorySessionStorage()),
        mockBackendProvider.overrideWithValue(backend),
        realtimeEnabledProvider.overrideWithValue(false),
        ...overrides,
      ],
      child: const SmartHomeApp(),
    );

Future<void> _openHome(
  WidgetTester tester,
  MockBackend backend, {
  List<Override> overrides = const [],
}) async {
  tester.view.physicalSize = const Size(1000, 3200);
  tester.view.devicePixelRatio = 1;
  addTearDown(tester.view.reset);
  await tester.pumpWidget(_app(backend, overrides: overrides));
  await tester.pumpAndSettle();
  await tester.enterText(
    find.widgetWithText(TextFormField, 'Email hoặc mã người dùng'),
    'user01@smarthome.local',
  );
  await tester.enterText(
    find.widgetWithText(TextFormField, 'Mật khẩu'),
    'user123',
  );
  await tester.tap(find.text('ĐĂNG NHẬP'));
  await tester.pumpAndSettle();
}

void main() {
  group('mock data of user01 = the web demo home', () {
    final backend = MockBackend();
    final user = backend.accountByEmail('user01@smarthome.local')!;

    test('one home called "Nhà của Nguyễn Hoàng Đạt"', () {
      backend.currentUserId = user.id;
      final homes = backend.myHomes();
      expect(homes.map((h) => h.home.name), ['Nhà của Nguyễn Hoàng Đạt']);
    });

    test('only "Phòng khách" and "Camera", with the demo hardware', () {
      backend.currentUserId = user.id;
      final homeId = backend.myHomes().single.id;
      final overview = backend.overviewFor(homeId);
      expect(overview.rooms.map((r) => r.name), ['Phòng khách', 'Camera']);
      expect(overview.rooms.map((r) => r.roomType), ['living_room', 'camera']);

      final names = {for (final d in overview.devices) d.name: d};
      expect(names.keys, {
        'Cảm biến nhiệt/ẩm phòng khách',
        'Đèn phòng khách',
        'Quạt phòng khách',
        'Rèm cửa phòng khách',
        'Điều hòa phòng khách',
        'Camera',
      });
      expect(
        names['Cảm biến nhiệt/ẩm phòng khách']!.category,
        DeviceCategory.sensor,
      );
      expect(names['Camera']!.category, DeviceCategory.camera);
      expect(names['Camera']!.roomName, 'Camera');
      expect(overview.relays, hasLength(4));
      expect(overview.cameras.single.name, 'Camera');
      expect(overview.gateway, isNotNull);

      // Nothing of the old demo layout is left in this home.
      final text = [
        ...overview.devices.map((d) => d.name),
        ...overview.rooms.map((r) => r.name),
        ...backend.rules.where((r) => r.homeId == homeId).map((r) => r.name),
        ...backend.notifications
            .where((n) => n.notification.homeId == homeId)
            .map((n) => '${n.notification.title} ${n.notification.message}'),
      ].join('\n').toLowerCase();
      for (final gone in ['bếp', 'phòng ngủ', 'cửa chính', 'demo phần cứng']) {
        expect(text, isNot(contains(gone)));
      }
    });

    test('other accounts and homes are still there', () {
      expect(backend.homes.map((h) => h.home.name), contains('Nhà Quận 7'));
      expect(backend.codes, isNotEmpty);
    });
  });

  group('mock camera', () {
    test('sample snapshots: newest first, valid PNG pictures', () async {
      final backend = MockBackend()..currentUserId = 7;
      final repo = MockDeviceRepository(backend);
      final camera = backend.devices.firstWhere((d) => d.isCamera);
      final list = await repo.listSnapshots(camera.id);
      expect(list.length, inInclusiveRange(3, 5));
      final sorted = [...list]..sort(CameraSnapshot.newestFirst);
      expect(list.map((s) => s.id), sorted.map((s) => s.id));
      expect(
        list.every(
          (s) =>
              s.capturedAt.isBefore(backend.now) &&
              backend.now.difference(s.capturedAt) < const Duration(days: 2),
        ),
        isTrue,
      );
      expect(list.map((s) => s.trigger).toSet(), {
        SnapshotTrigger.motion,
        SnapshotTrigger.request,
      });
      final bytes = await repo.snapshotImage(list.first.id);
      expect(bytes.sublist(0, 8), pngSignature);
      expect(await repo.listSnapshots(camera.id, limit: 2), hasLength(2));
      // Not a camera → nothing.
      final lamp = backend.devices.firstWhere(
        (d) => d.name == 'Đèn phòng khách',
      );
      expect(await repo.listSnapshots(lamp.id), isEmpty);
    });
  });

  group('PNG encoder', () {
    test('checksums match the reference values', () {
      final digits = Uint8List.fromList('123456789'.codeUnits);
      expect(crc32(digits), 0xCBF43926);
      expect(adler32(Uint8List.fromList('Wikipedia'.codeUnits)), 0x11E60398);
    });

    test('writes a valid PNG: signature, IHDR, IDAT, IEND with CRCs', () {
      const w = 7;
      const h = 5;
      final png = encodePngRgb(w, h, Uint8List(w * h * 3));
      expect(png.sublist(0, 8), pngSignature);
      final data = ByteData.sublistView(png);
      var offset = 8;
      final types = <String>[];
      while (offset < png.length) {
        final length = data.getUint32(offset);
        final type = String.fromCharCodes(png.sublist(offset + 4, offset + 8));
        types.add(type);
        final body = Uint8List.sublistView(
          png,
          offset + 4,
          offset + 8 + length,
        );
        expect(
          data.getUint32(offset + 8 + length),
          crc32(body),
          reason: '$type CRC',
        );
        if (type == 'IHDR') {
          expect(data.getUint32(offset + 8), w);
          expect(data.getUint32(offset + 12), h);
          expect(data.getUint8(offset + 16), 8); // bit depth
          expect(data.getUint8(offset + 17), 2); // RGB
        }
        offset += 12 + length;
      }
      expect(types, ['IHDR', 'IDAT', 'IEND']);
      expect(offset, png.length);
    });

    test('a picture bigger than one stored block still ends cleanly', () {
      final png = encodePngRgb(200, 150, Uint8List(200 * 150 * 3));
      expect(png.sublist(0, 8), pngSignature);
      // IEND: length 0, type, fixed CRC AE426082.
      expect(ByteData.sublistView(png).getUint32(png.length - 4), 0xAE426082);
    });

    test('rejects a buffer of the wrong size', () {
      expect(
        () => encodePngRgb(2, 2, Uint8List(5)),
        throwsA(isA<ArgumentError>()),
      );
    });
  });

  group('Home screen', () {
    testWidgets('no "Phòng" section; a "Camera" section with the camera card', (
      tester,
    ) async {
      final backend = MockBackend();
      await _openHome(tester, backend);
      final camera = backend.devices.firstWhere((d) => d.isCamera);

      expect(find.text('Phòng'), findsNothing);
      expect(find.text('Điều khiển nhanh'), findsOneWidget);
      expect(find.widgetWithText(SectionHeader, 'Camera'), findsOneWidget);
      final card = find.byKey(ValueKey<String>('camera-card-${camera.id}'));
      expect(card, findsOneWidget);
      expect(
        find.descendant(of: card, matching: find.text('Camera')),
        findsOneWidget,
      );
      expect(
        find.descendant(of: card, matching: find.text('Online')),
        findsOneWidget,
      );
      expect(
        find.descendant(of: card, matching: find.textContaining('Ảnh lúc')),
        findsOneWidget,
      );
      expect(find.text('Chưa có ảnh'), findsNothing);
      expect(
        find.byKey(ValueKey<String>('camera-watch-${camera.id}')),
        findsOneWidget,
      );
      // The camera section sits right under the quick controls.
      expect(
        tester.getTopLeft(find.widgetWithText(SectionHeader, 'Camera')).dy,
        greaterThan(tester.getTopLeft(find.text('Điều khiển nhanh')).dy),
      );
    });

    testWidgets('a camera without pictures shows "Chưa có ảnh"', (
      tester,
    ) async {
      final backend = MockBackend();
      final camera = backend.devices.firstWhere((d) => d.isCamera);
      await _openHome(
        tester,
        backend,
        overrides: [
          cameraSnapshotsProvider(
            camera.id,
          ).overrideWith((ref) async => const <CameraSnapshot>[]),
        ],
      );
      expect(find.text('Chưa có ảnh'), findsOneWidget);
      expect(find.textContaining('Ảnh lúc'), findsNothing);
    });

    testWidgets('"Xem trực tiếp" opens the camera page and starts the stream', (
      tester,
    ) async {
      final backend = MockBackend();
      await _openHome(tester, backend);
      final camera = backend.devices.firstWhere((d) => d.isCamera);

      await tester.tap(
        find.byKey(ValueKey<String>('camera-watch-${camera.id}')),
      );
      await tester.pump();
      await tester.pump(const Duration(milliseconds: 400));
      expect(find.widgetWithText(AppBar, 'Camera'), findsOneWidget);
      // Playing without tapping the player's own play button.
      expect(find.text(cameraLiveConnectingMessage), findsOneWidget);
      await tester.pump(const Duration(milliseconds: 700));
      expect(find.textContaining('hình mô phỏng'), findsOneWidget);
      expect(find.byKey(const ValueKey<String>('camera-live-pause')), findsOne);
      expect(
        find.byKey(const ValueKey<String>('camera-live-play')),
        findsNothing,
      );

      // Leaving the page stops the simulated stream (no timer left behind).
      await tester.pageBack();
      await tester.pumpAndSettle();
      expect(find.text('Điều khiển nhanh'), findsOneWidget);
    });

    testWidgets('tapping the rest of the card opens the page without playing', (
      tester,
    ) async {
      final backend = MockBackend();
      await _openHome(tester, backend);
      final camera = backend.devices.firstWhere((d) => d.isCamera);

      await tester.tap(
        find.descendant(
          of: find.byKey(ValueKey<String>('camera-card-${camera.id}')),
          matching: find.text('Camera'),
        ),
      );
      await tester.pumpAndSettle();
      expect(find.widgetWithText(AppBar, 'Camera'), findsOneWidget);
      expect(find.byKey(const ValueKey<String>('camera-live-play')), findsOne);
      expect(
        find.byKey(const ValueKey<String>('camera-live-pause')),
        findsNothing,
      );
    });

    testWidgets('an offline camera only opens its page', (tester) async {
      final backend = MockBackend();
      final index = backend.devices.indexWhere((d) => d.isCamera);
      backend.devices[index] = backend.devices[index].copyWith(online: false);
      final camera = backend.devices[index];
      await _openHome(tester, backend);

      expect(find.text('Ngoại tuyến'), findsWidgets);
      await tester.tap(
        find.byKey(ValueKey<String>('camera-watch-${camera.id}')),
      );
      await tester.pumpAndSettle();
      expect(find.widgetWithText(AppBar, 'Camera'), findsOneWidget);
      expect(find.text('Camera ngoại tuyến'), findsOneWidget);
      expect(
        find.byKey(const ValueKey<String>('camera-live-pause')),
        findsNothing,
      );
    });

    testWidgets('a home without a camera has no "Camera" section', (
      tester,
    ) async {
      final backend = MockBackend();
      backend.devices.removeWhere((d) => d.isCamera);
      await _openHome(tester, backend);
      expect(find.widgetWithText(SectionHeader, 'Camera'), findsNothing);
    });
  });

  group('Devices page', () {
    testWidgets('a room title opens the room page; "Chưa gán phòng" does not', (
      tester,
    ) async {
      final backend = MockBackend();
      await _openHome(tester, backend);
      await tester.tap(find.byKey(const ValueKey<String>('all-devices')));
      await tester.pumpAndSettle();

      final living = backend.rooms.firstWhere((r) => r.name == 'Phòng khách');
      final header = find.byKey(ValueKey<String>('group-room-${living.id}'));
      expect(header, findsOneWidget);
      expect(
        find.descendant(of: header, matching: find.byType(InkWell)),
        findsOneWidget,
      );
      await tester.tap(header);
      await tester.pumpAndSettle();
      expect(find.widgetWithText(AppBar, 'Phòng khách'), findsOneWidget);
    });

    testWidgets('the unassigned group title is plain text', (tester) async {
      final backend = MockBackend();
      final index = backend.devices.indexWhere(
        (d) => d.name == 'Quạt phòng khách',
      );
      final fan = backend.devices[index];
      // A device whose room is not in the overview lands in "Chưa gán phòng".
      backend.devices[index] = fan.copyWith(roomId: 9999);
      await _openHome(tester, backend);
      await tester.tap(find.byKey(const ValueKey<String>('all-devices')));
      await tester.pumpAndSettle();

      final header = find.byKey(const ValueKey<String>('group-unassigned'));
      expect(header, findsOneWidget);
      expect(
        find.descendant(of: header, matching: find.byType(InkWell)),
        findsNothing,
      );
      expect(find.text('Chưa gán phòng'), findsOneWidget);
    });
  });
}
