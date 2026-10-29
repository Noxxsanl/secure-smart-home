import 'package:flutter/foundation.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

/// Runtime configuration, read from `--dart-define`.
///
/// - `API_BASE_URL`: backend origin without the `/api` suffix, e.g.
///   `https://smarthome.example.com`. Defaults to `http://10.0.2.2:5000` on
///   Android (emulator → host machine) and `http://localhost:5000` elsewhere.
/// - `USE_MOCK=true`: run on the in-memory mock repositories (no backend).
class AppConfig {
  const AppConfig({required this.apiBaseUrl, this.useMock = false});

  factory AppConfig.fromEnvironment() {
    const definedUrl = String.fromEnvironment('API_BASE_URL');
    const useMock = bool.fromEnvironment('USE_MOCK');
    return AppConfig(
      apiBaseUrl: normalizeBaseUrl(
        definedUrl.trim().isEmpty ? defaultApiBaseUrl() : definedUrl,
      ),
      useMock: useMock,
    );
  }

  /// Backend origin, no trailing slash.
  final String apiBaseUrl;

  /// True when the app runs on mock repositories only.
  final bool useMock;

  /// Prefix of every REST call made by the app (docs/architecture/MOBILE_APP_ARCHITECTURE.md §10).
  String get mobileApiBaseUrl => '$apiBaseUrl/api/mobile';

  /// Realtime endpoint (contract §4.3).
  Uri get webSocketUri => deriveWebSocketUri(apiBaseUrl);
}

/// Default backend origin when `API_BASE_URL` is not defined.
String defaultApiBaseUrl({TargetPlatform? platform, bool isWeb = kIsWeb}) {
  final target = platform ?? defaultTargetPlatform;
  if (!isWeb && target == TargetPlatform.android) {
    return 'http://10.0.2.2:5000';
  }
  return 'http://localhost:5000';
}

/// Trims whitespace and trailing slashes.
String normalizeBaseUrl(String url) {
  var result = url.trim();
  while (result.endsWith('/')) {
    result = result.substring(0, result.length - 1);
  }
  return result;
}

/// `http://host:5000` → `ws://host:5000/api/mobile/ws`,
/// `https://host` → `wss://host/api/mobile/ws`.
Uri deriveWebSocketUri(String apiBaseUrl) {
  final base = Uri.parse(normalizeBaseUrl(apiBaseUrl));
  final scheme = base.scheme == 'https' ? 'wss' : 'ws';
  var basePath = base.path;
  while (basePath.endsWith('/')) {
    basePath = basePath.substring(0, basePath.length - 1);
  }
  return base.replace(scheme: scheme, path: '$basePath/api/mobile/ws');
}

final appConfigProvider = Provider<AppConfig>(
  (ref) => AppConfig.fromEnvironment(),
);
