import 'dart:async';
import 'dart:typed_data';

import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/config/app_config.dart';
import '../../../core/network/network_providers.dart';
import '../../../mock/mock_providers.dart';
import '../../auth/auth.dart';
import '../data/device_mock_repository.dart';
import '../data/device_remote_repository.dart';
import '../domain/camera_live.dart';
import '../domain/camera_snapshot.dart';
import '../domain/device.dart';
import '../domain/device_repository.dart';

final deviceRepositoryProvider = Provider<DeviceRepository>((ref) {
  final config = ref.watch(appConfigProvider);
  if (config.useMock) {
    return MockDeviceRepository(ref.watch(mockBackendProvider));
  }
  return RemoteDeviceRepository(ref.watch(apiClientProvider));
});

/// Devices whose relay command is in flight (FR-5.3). The tile shows a
/// spinner and ignores further taps until the ack, error or timeout.
class PendingCommandsNotifier extends Notifier<Set<int>> {
  @override
  Set<int> build() => const {};

  void begin(int deviceId) => state = {...state, deviceId};

  void end(int deviceId) => state = {...state}..remove(deviceId);
}

final pendingCommandsProvider =
    NotifierProvider<PendingCommandsNotifier, Set<int>>(
      PendingCommandsNotifier.new,
    );

typedef TelemetryQuery = ({int deviceId, TelemetryRange range});

/// `GET /devices/:id/telemetry?range=` (FR-5.4).
final telemetryProvider = FutureProvider.autoDispose
    .family<TelemetrySeries, TelemetryQuery>((ref, query) {
      ref.watch(sessionUserIdProvider);
      return ref
          .watch(deviceRepositoryProvider)
          .telemetry(query.deviceId, query.range);
    });

/// Pictures shown on the camera detail page (newest first, at most 20).
/// Invalidated by the realtime controller on `camera_snapshot`.
const cameraSnapshotLimit = 20;

final cameraSnapshotsProvider = FutureProvider.autoDispose
    .family<List<CameraSnapshot>, int>((ref, deviceId) {
      ref.watch(sessionUserIdProvider);
      return ref
          .watch(deviceRepositoryProvider)
          .listSnapshots(deviceId, limit: cameraSnapshotLimit);
    });

/// How long JPEG bytes stay in memory after the last widget showing them is
/// gone. Bounds RAM when a camera reports motion all day (each picture is up to
/// 200 KB): only pictures on screen plus those seen in the last few minutes stay.
const snapshotImageCacheTtl = Duration(minutes: 2);

/// JPEG bytes of one snapshot. A snapshot never changes, so the bytes are kept
/// while shown and for [snapshotImageCacheTtl] afterwards (switching thumbnails
/// does not re-download); dropped when the user changes.
final snapshotImageProvider = FutureProvider.autoDispose.family<Uint8List, int>(
  (ref, snapshotId) {
    ref.watch(sessionUserIdProvider);
    final link = ref.keepAlive();
    Timer? timer;
    ref.onCancel(() => timer = Timer(snapshotImageCacheTtl, link.close));
    ref.onResume(() => timer?.cancel());
    ref.onDispose(() => timer?.cancel());
    return ref.watch(deviceRepositoryProvider).snapshotImage(snapshotId);
  },
);

/// Where the camera live view reads frames from; `null` while the backend does
/// not relay the camera stream yet (the player then explains that live view is
/// not available, see [CameraLiveSource]). Plug the real source in here.
final cameraLiveSourceProvider = Provider<CameraLiveSource?>((ref) {
  ref.watch(sessionUserIdProvider);
  return null;
});
