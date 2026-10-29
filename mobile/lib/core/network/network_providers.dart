import 'dart:async';

import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:http/http.dart' as http;

import '../config/app_config.dart';
import '../storage/session_storage.dart';
import 'api_client.dart';

final httpClientProvider = Provider<http.Client>((ref) {
  final client = http.Client();
  ref.onDispose(client.close);
  return client;
});

/// Lets the network layer announce "the session is over" without depending on
/// the auth feature (the auth controller subscribes to [stream]).
class SessionExpiryBus {
  final _controller = StreamController<void>.broadcast();

  Stream<void> get stream => _controller.stream;

  void notifyExpired() {
    if (!_controller.isClosed) _controller.add(null);
  }

  void dispose() => _controller.close();
}

final sessionExpiryProvider = Provider<SessionExpiryBus>((ref) {
  final bus = SessionExpiryBus();
  ref.onDispose(bus.dispose);
  return bus;
});

/// The one [ApiClient] for `/api/mobile/**` (docs/architecture/MOBILE_APP_ARCHITECTURE.md §10: the app never calls
/// `/api/dashboard/**` or `/api/device/**`).
final apiClientProvider = Provider<ApiClient>((ref) {
  final config = ref.watch(appConfigProvider);
  final bus = ref.watch(sessionExpiryProvider);
  return ApiClient(
    baseUrl: config.mobileApiBaseUrl,
    httpClient: ref.watch(httpClientProvider),
    storage: ref.watch(sessionStorageProvider),
    onSessionExpired: bus.notifyExpired,
  );
});
