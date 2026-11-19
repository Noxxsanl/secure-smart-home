import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/config/app_config.dart';
import '../../../core/network/network_providers.dart';
import '../../../core/realtime/realtime_source.dart';
import '../../../mock/mock_providers.dart';
import '../../../mock/mock_realtime_source.dart';

/// Tests switch realtime off (no timers, no sockets).
final realtimeEnabledProvider = Provider<bool>((ref) => true);

/// The backend WebSocket, or the in-memory simulation in mock mode. The app
/// never opens an MQTT connection (invariant 7).
final realtimeSourceProvider = Provider<RealtimeSource>((ref) {
  final config = ref.watch(appConfigProvider);
  final RealtimeSource source;
  if (config.useMock) {
    source = MockRealtimeSource(ref.watch(mockBackendProvider));
  } else {
    final api = ref.watch(apiClientProvider);
    source = WebSocketRealtimeSource(
      uri: config.webSocketUri,
      readAccessToken: api.currentAccessToken,
      refreshSession: (rejected) =>
          api.refreshSession(staleAccessToken: rejected),
    );
  }
  ref.onDispose(source.dispose);
  return source;
});
