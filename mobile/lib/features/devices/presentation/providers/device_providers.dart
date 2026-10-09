import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../../core/config/app_config.dart';
import '../../../../core/network/network_providers.dart';
import '../../../../mock/mock_providers.dart';
import '../../../auth/presentation/providers/auth_providers.dart';
import '../../data/device_mock_repository.dart';
import '../../data/device_remote_repository.dart';
import '../../domain/device.dart';
import '../../domain/device_repository.dart';

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
