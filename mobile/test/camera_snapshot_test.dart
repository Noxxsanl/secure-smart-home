import 'dart:convert';
import 'dart:typed_data';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:smart_home_mobile/core/network/api_client.dart';
import 'package:smart_home_mobile/core/network/api_exception.dart';
import 'package:smart_home_mobile/core/realtime/realtime_source.dart';
import 'package:smart_home_mobile/core/storage/session_storage.dart';
import 'package:smart_home_mobile/modules/auth/auth.dart';
import 'package:smart_home_mobile/modules/devices/devices.dart';
import 'package:smart_home_mobile/modules/devices/features/device_detail/camera_snapshots_section.dart';
import 'package:smart_home_mobile/modules/realtime/realtime.dart';

const _item = {
  'id': 345,
  'trigger': 'motion',
  'size_bytes': 11234,
  'captured_at': '2026-11-10T08:00:00.000Z',
};

final _png = base64Decode(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
);

class _CameraRepo implements DeviceRepository {
  _CameraRepo(this.items);

  final List<CameraSnapshot> items;

  @override
  Future<List<CameraSnapshot>> listSnapshots(int deviceId, {int limit = 20}) async =>
      items;

  @override
  Future<Uint8List> snapshotImage(int snapshotId) async => _png;

  @override
  dynamic noSuchMethod(Invocation invocation) => throw UnimplementedError();
}

Future<void> _pump(WidgetTester tester, List<CameraSnapshot> items) {
  return tester.pumpWidget(
    ProviderScope(
      overrides: [
        sessionUserIdProvider.overrideWithValue(7),
        deviceRepositoryProvider.overrideWithValue(_CameraRepo(items)),
      ],
      child: const MaterialApp(
        home: Scaffold(body: SingleChildScrollView(child: CameraSnapshotsSection(deviceId: 12))),
      ),
    ),
  );
}

void main() {
  test('CameraSnapshot / list JSON, newest first, bad items skipped', () {
    final snapshot = cameraSnapshotFromJson(_item);
    expect(snapshot.id, 345);
    expect(snapshot.trigger, SnapshotTrigger.motion);
    expect(snapshot.trigger.label, 'Chuyển động');
    expect(snapshot.sizeBytes, 11234);
    expect(snapshot.capturedAt.isUtc, isTrue);
    // 08:00 UTC = 15:00 in Vietnam, regardless of the phone zone.
    expect(formatSnapshotTime(snapshot.capturedAt), '15:00 10/11/2026');

    final list = cameraSnapshotsFromJson({
      'device_id': 12,
      'items': [
        _item,
        {'id': 344, 'trigger': 'request', 'size_bytes': 9, 'captured_at': null},
        {..._item, 'id': 343, 'trigger': 'request'},
      ],
    });
    expect(list.map((s) => s.id), [345, 343]);
    expect(list.last.trigger.label, 'Theo yêu cầu');
    expect(cameraSnapshotsFromJson({'device_id': 12}), isEmpty);
  });

  test('camera_snapshot WebSocket frame → CameraSnapshotEvent', () {
    final event = parseRealtimeEvent(
      RealtimeMessage('camera_snapshot', {
        'type': 'camera_snapshot',
        'home_id': 3,
        'device_id': 12,
        'snapshot': _item,
      }),
    );
    expect(event, isA<CameraSnapshotEvent>());
    final camera = event! as CameraSnapshotEvent;
    expect(camera.homeId, 3);
    expect(camera.deviceId, 12);
    expect(camera.snapshot.id, 345);

    // Missing snapshot payload → ignored, never throws.
    expect(
      parseRealtimeEvent(
        RealtimeMessage('camera_snapshot', {'home_id': 3, 'device_id': 12}),
      ),
      isNull,
    );
  });

  test('getBytes sends Bearer, refreshes once on 401 and returns the JPEG', () async {
    final jpeg = Uint8List.fromList([0xFF, 0xD8, 1, 2, 3, 0xFF, 0xD9]);
    final seen = <String>[];
    final api = ApiClient(
      baseUrl: 'http://backend.test/api/mobile',
      storage: MemorySessionStorage(
        tokens: const SessionTokens(accessToken: 'a1', refreshToken: 'r1'),
      ),
      httpClient: MockClient((request) async {
        if (request.url.path == '/api/mobile/auth/refresh') {
          return http.Response(
            jsonEncode({
              'access_token': 'a2',
              'refresh_token': 'r2',
              'token_type': 'Bearer',
              'expires_in': 900,
              'refresh_expires_in': 2592000,
              'user': {'id': 7, 'role': 'user'},
            }),
            200,
            headers: {'content-type': 'application/json'},
          );
        }
        seen.add('${request.url.path} ${request.headers['Authorization']}');
        if (request.headers['Authorization'] == 'Bearer a1') {
          return http.Response(
            jsonEncode({'error': 'TOKEN_EXPIRED'}),
            401,
            headers: {'content-type': 'application/json'},
          );
        }
        return http.Response.bytes(
          jpeg,
          200,
          headers: {'content-type': 'image/jpeg'},
        );
      }),
    );

    final bytes = await api.getBytes('/snapshots/345/image');
    expect(bytes, jpeg);
    expect(seen, [
      '/api/mobile/snapshots/345/image Bearer a1',
      '/api/mobile/snapshots/345/image Bearer a2',
    ]);
  });

  test('getBytes maps 404 to NOT_FOUND', () async {
    final api = ApiClient(
      baseUrl: 'http://backend.test/api/mobile',
      storage: MemorySessionStorage(
        tokens: const SessionTokens(accessToken: 'a1', refreshToken: 'r1'),
      ),
      httpClient: MockClient(
        (_) async => http.Response(jsonEncode({'error': 'NOT_FOUND'}), 404),
      ),
    );
    await expectLater(
      api.getBytes('/snapshots/1/image'),
      throwsA(
        isA<ApiException>().having((e) => e.code, 'code', 'NOT_FOUND'),
      ),
    );
  });

  testWidgets('camera block: empty state, then newest picture with label and thumbnails', (
    tester,
  ) async {
    tester.view.physicalSize = const Size(400, 1200);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.reset);
    await _pump(tester, const []);
    await tester.pumpAndSettle();
    expect(find.text('Ảnh camera'), findsOneWidget);
    expect(
      find.text('Chưa có ảnh nào. Camera sẽ gửi ảnh khi phát hiện chuyển động.'),
      findsOneWidget,
    );

    await _pump(tester, [
      cameraSnapshotFromJson(_item),
      cameraSnapshotFromJson({..._item, 'id': 344, 'trigger': 'request'}),
    ]);
    await tester.pumpAndSettle();
    expect(find.text('15:00 10/11/2026'), findsOneWidget);
    expect(find.text('Chuyển động'), findsOneWidget);
    expect(find.byKey(const ValueKey<String>('camera-thumb-344')), findsOneWidget);

    await tester.tap(find.byKey(const ValueKey<String>('camera-thumb-344')));
    await tester.pumpAndSettle();
    expect(find.text('Theo yêu cầu'), findsOneWidget);
  });
}
