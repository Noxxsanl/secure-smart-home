import 'dart:async';
import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:smart_home_mobile/core/config/app_config.dart';
import 'package:smart_home_mobile/modules/auth/auth.dart';
import 'package:smart_home_mobile/modules/devices/application/camera_live_providers.dart';
import 'package:smart_home_mobile/modules/devices/data/camera_live_mock_source.dart';
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
  final controller = StreamController<CameraLiveEvent>();
  int opened = 0;

  @override
  Stream<CameraLiveEvent> watch(int deviceId) {
    opened++;
    return controller.stream;
  }
}

Future<void> _pumpLive(
  WidgetTester tester, {
  CameraLiveSource? source,
  bool online = true,
  bool useMock = false,
  bool autoStart = false,
}) {
  return tester.pumpWidget(
    ProviderScope(
      overrides: [
        sessionUserIdProvider.overrideWithValue(7),
        appConfigProvider.overrideWithValue(
          AppConfig(apiBaseUrl: 'http://localhost:5000', useMock: useMock),
        ),
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
                autoStart: autoStart,
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

  testWidgets('no live source: the player explains, play is off', (
    tester,
  ) async {
    await _pumpLive(tester);
    expect(find.text('Chưa xem trực tiếp được'), findsOneWidget);
    expect(
      find.textContaining('chưa dùng được trên máy chủ này'),
      findsOneWidget,
    );
    expect(find.text('TRỰC TIẾP'), findsOneWidget);
    await tester.tap(find.byKey(const ValueKey<String>('camera-live-play')));
    await tester.pump();
    expect(find.text(cameraLiveConnectingMessage), findsNothing);
  });

  testWidgets('autoStart opens the stream without a tap; an offline camera '
      'does not', (tester) async {
    final source = _FakeLiveSource();
    await _pumpLive(tester, source: source, autoStart: true);
    await tester.pump();
    expect(source.opened, 1);
    expect(find.text(cameraLiveConnectingMessage), findsOneWidget);
    await tester.pumpWidget(const SizedBox.shrink());

    final offline = _FakeLiveSource();
    await _pumpLive(tester, source: offline, online: false, autoStart: true);
    await tester.pump();
    expect(offline.opened, 0);
    expect(find.text('Camera ngoại tuyến'), findsOneWidget);
    await tester.pumpWidget(const SizedBox.shrink());
  });

  testWidgets('mock mode plays the simulated camera: connecting → live frames '
      '→ stops on pause', (tester) async {
    await _pumpLive(
      tester,
      source: CameraLiveMockSource(),
      useMock: true,
      autoStart: true,
    );
    await tester.pump();
    expect(find.text(cameraLiveConnectingMessage), findsOneWidget);
    await tester.pump(const Duration(milliseconds: 700));
    expect(find.byType(Image), findsOneWidget);
    expect(find.textContaining('hình mô phỏng'), findsOneWidget);
    final first = tester.widget<Image>(find.byType(Image)).image;
    await tester.pump(const Duration(milliseconds: 200));
    expect(tester.widget<Image>(find.byType(Image)).image, isNot(first));
    await tester.tap(find.byKey(const ValueKey<String>('camera-live-pause')));
    await tester.pump();
    // The timers died with the subscription: nothing left to wait for.
    expect(find.byType(Image), findsNothing);
    await tester.pumpWidget(const SizedBox.shrink());
  });

  testWidgets('with a source: play → connecting → frames → reconnecting → '
      'frames → pause', (tester) async {
    final source = _FakeLiveSource();
    await _pumpLive(tester, source: source);
    expect(find.text('Xem trực tiếp'), findsWidgets);
    expect(source.opened, 0, reason: 'stream starts only on tap');

    await tester.tap(find.byKey(const ValueKey<String>('camera-live-play')));
    await tester.pump();
    expect(source.opened, 1);
    expect(find.text('Đang kết nối camera…'), findsOneWidget);

    // The relay saying "live" is not a picture yet.
    source.controller.add(const CameraLiveStateChanged(CameraLiveState.live));
    await tester.pump();
    expect(find.text('Đang kết nối camera…'), findsOneWidget);

    source.controller.add(CameraLiveFrame(_png));
    await tester.pump();
    expect(find.byType(Image), findsOneWidget);
    expect(find.text('Đang kết nối camera…'), findsNothing);
    expect(
      find.byKey(const ValueKey<String>('camera-live-fullscreen')),
      findsOneWidget,
    );

    // Signal lost: the last picture stays, a message explains.
    source.controller.add(
      const CameraLiveStateChanged(CameraLiveState.reconnecting),
    );
    await tester.pump();
    expect(find.text('Mất tín hiệu, đang kết nối lại…'), findsOneWidget);
    expect(find.byType(Image), findsOneWidget);

    source.controller.add(CameraLiveFrame(_png));
    await tester.pump();
    expect(find.text('Mất tín hiệu, đang kết nối lại…'), findsNothing);

    await tester.tap(find.byKey(const ValueKey<String>('camera-live-pause')));
    await tester.pump();
    expect(
      find.byKey(const ValueKey<String>('camera-live-pause')),
      findsNothing,
    );
    expect(source.controller.hasListener, isFalse);
  });

  testWidgets('an ended stream shows the guidance sentence and allows retry', (
    tester,
  ) async {
    final source = _FakeLiveSource();
    await _pumpLive(tester, source: source);
    await tester.tap(find.byKey(const ValueKey<String>('camera-live-play')));
    await tester.pump();

    source.controller.add(CameraLiveEnded(cameraLiveCloseMessage(4408)));
    await tester.pump();
    expect(
      find.textContaining('Camera không phản hồi — kiểm tra nguồn camera'),
      findsOneWidget,
    );
    expect(find.text('Thử lại'), findsOneWidget);
  });

  testWidgets('leaving the page closes the stream', (tester) async {
    final source = _FakeLiveSource();
    await _pumpLive(tester, source: source);
    await tester.tap(find.byKey(const ValueKey<String>('camera-live-play')));
    await tester.pump();
    expect(source.controller.hasListener, isTrue);

    await tester.pumpWidget(const SizedBox.shrink());
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
