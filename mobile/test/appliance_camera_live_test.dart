import 'dart:async';
import 'dart:convert';
import 'dart:typed_data';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:smart_home_mobile/modules/auth/auth.dart';
import 'package:smart_home_mobile/modules/devices/devices.dart';
import 'package:smart_home_mobile/modules/devices/features/device_detail/camera_live_view.dart';

final _png = base64Decode(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
);

CustomerDevice _device(
  String name, {
  DeviceCategory category = DeviceCategory.relay,
  bool online = true,
}) => CustomerDevice(
  id: 31,
  deviceUid: 'ESP32-XX-1',
  name: name,
  category: category,
  homeId: 1,
  status: DeviceStatus.active,
  online: online,
  canControl: true,
  power: category == DeviceCategory.relay ? false : null,
);

class _FakeLiveSource implements CameraLiveSource {
  final controller = StreamController<Uint8List>();
  int opened = 0;

  @override
  Stream<Uint8List> frames(int deviceId) {
    opened++;
    return controller.stream;
  }
}

Future<void> _pumpLive(
  WidgetTester tester, {
  CameraLiveSource? source,
  bool online = true,
}) {
  return tester.pumpWidget(
    ProviderScope(
      overrides: [
        sessionUserIdProvider.overrideWithValue(7),
        cameraLiveSourceProvider.overrideWithValue(source),
      ],
      child: MaterialApp(
        home: Scaffold(
          // Phone width, so the whole 4:3 player fits on the test screen.
          body: SingleChildScrollView(
            child: SizedBox(
              width: 360,
              child: CameraLiveView(
                device: _device(
                  'Camera',
                  category: DeviceCategory.camera,
                  online: online,
                ),
              ),
            ),
          ),
        ),
      ),
    ),
  );
}

void main() {
  test('appliance kind is guessed from the relay name', () {
    expect(ApplianceKind.of(_device('Đèn phòng khách')), ApplianceKind.lamp);
    expect(ApplianceKind.of(_device('Quạt phòng khách')), ApplianceKind.fan);
    expect(
      ApplianceKind.of(_device('Rèm cửa phòng khách')),
      ApplianceKind.curtain,
    );
    expect(
      ApplianceKind.of(_device('Điều hòa phòng khách')),
      ApplianceKind.airConditioner,
    );
    expect(
      ApplianceKind.of(_device('Điều hoà phòng ngủ')),
      ApplianceKind.airConditioner,
    );
    expect(ApplianceKind.of(_device('Ổ cắm')), ApplianceKind.plainSwitch);
    expect(
      ApplianceKind.of(_device('Camera', category: DeviceCategory.camera)),
      isNull,
    );

    expect(ApplianceKind.curtain.stateOf(true), 'Đang mở');
    expect(ApplianceKind.curtain.turnOff, 'Đóng');
    expect(deviceSubtitle(_device('Rèm cửa phòng khách')), 'Đang đóng');
    expect(deviceTypeLabel(_device('Điều hòa phòng khách')), 'Điều hòa');
  });

  testWidgets('without a live source the player explains, play is disabled', (
    tester,
  ) async {
    await _pumpLive(tester);
    expect(find.text('Chưa hỗ trợ xem trực tiếp trên ứng dụng'), findsOneWidget);
    expect(find.text('TRỰC TIẾP'), findsOneWidget);
    await tester.tap(find.byKey(const ValueKey<String>('camera-live-play')));
    await tester.pump();
    expect(find.text('Đang kết nối tới camera…'), findsNothing);
  });

  testWidgets('with a source: tap play → connecting → frames → pause', (
    tester,
  ) async {
    final source = _FakeLiveSource();
    await _pumpLive(tester, source: source);
    expect(find.text('Xem trực tiếp'), findsWidgets);
    expect(source.opened, 0, reason: 'stream starts only on tap');

    await tester.tap(find.byKey(const ValueKey<String>('camera-live-play')));
    await tester.pump();
    expect(source.opened, 1);
    expect(find.text('Đang kết nối tới camera…'), findsOneWidget);

    source.controller.add(_png);
    await tester.pump();
    expect(find.byType(Image), findsOneWidget);
    expect(
      find.byKey(const ValueKey<String>('camera-live-fullscreen')),
      findsOneWidget,
    );

    await tester.tap(find.byKey(const ValueKey<String>('camera-live-pause')));
    await tester.pump();
    expect(find.byKey(const ValueKey<String>('camera-live-pause')), findsNothing);
    expect(source.controller.hasListener, isFalse);
  });

  testWidgets('offline camera cannot start the stream', (tester) async {
    final source = _FakeLiveSource();
    await _pumpLive(tester, source: source, online: false);
    expect(find.text('Camera ngoại tuyến'), findsOneWidget);
    await tester.tap(find.byKey(const ValueKey<String>('camera-live-play')));
    await tester.pump();
    expect(source.opened, 0);
  });
}
