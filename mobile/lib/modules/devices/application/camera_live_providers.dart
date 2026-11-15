import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/config/app_config.dart';
import '../../../core/network/network_providers.dart';
import '../../auth/auth.dart';
import '../data/camera_live_mock_source.dart';
import '../data/camera_live_ws_source.dart';
import '../domain/camera_live.dart';

/// Where the camera live view reads pictures from: the backend relay
/// (`/api/mobile/cameras/:id/live`, FR-5.8). In mock mode there is no camera
/// behind the in-memory backend, so [CameraLiveMockSource] plays an animated
/// sample scene (about 5 pictures a second) instead.
/// Tests override this provider with a fake source.
final cameraLiveSourceProvider = Provider<CameraLiveSource?>((ref) {
  ref.watch(sessionUserIdProvider);
  final config = ref.watch(appConfigProvider);
  if (config.useMock) return CameraLiveMockSource();
  final api = ref.watch(apiClientProvider);
  return WebSocketCameraLiveSource(
    uriFor: (deviceId) => cameraLiveUri(config.apiBaseUrl, deviceId),
    readAccessToken: api.currentAccessToken,
    refreshSession: (rejected) =>
        api.refreshSession(staleAccessToken: rejected),
  );
});
