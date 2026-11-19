import 'package:flutter/foundation.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

/// Runtime configuration, read from `--dart-define`.
///
/// - `API_BASE_URL`: backend origin without the `/api` suffix, e.g.
///   `https://192.168.1.100` (qua nginx — chỉ HTTPS, cổng 80 chuyển hướng) hoặc
///   `https://smarthome.example.com`. Defaults to `http://10.0.2.2:5000` on
///   Android (emulator → host machine, chỉ để dev) and `http://localhost:5000` elsewhere.
/// - `API_CA_PEM_BASE64`: CA nội bộ (base64 của infra/mosquitto/certs/ca.crt)
///   để tin chứng chỉ của nginx — xem core/config/trusted_ca_io.dart.
/// - `AGENT_BASE_URL`: AI Agent endpoint of the voice/text assistant, e.g.
///   `http://10.0.2.2:8000/v1` (Android emulator → agent on the host). Defaults
///   to `<API_BASE_URL>/api/agent` (nginx forwards it to the agent).
/// - `USE_MOCK=true`: run on the in-memory mock repositories (no backend).
class AppConfig {
  const AppConfig({
    required this.apiBaseUrl,
    this.useMock = false,
    String? agentBaseUrl,
  }) : agentBaseUrl = agentBaseUrl ?? '$apiBaseUrl/api/agent';

  factory AppConfig.fromEnvironment() {
    const definedUrl = String.fromEnvironment('API_BASE_URL');
    const definedAgentUrl = String.fromEnvironment('AGENT_BASE_URL');
    const useMock = bool.fromEnvironment('USE_MOCK');
    return AppConfig(
      apiBaseUrl: normalizeBaseUrl(
        definedUrl.trim().isEmpty ? defaultApiBaseUrl() : definedUrl,
      ),
      useMock: useMock,
      agentBaseUrl: definedAgentUrl.trim().isEmpty
          ? null
          : normalizeBaseUrl(definedAgentUrl),
    );
  }

  /// Backend origin, no trailing slash.
  final String apiBaseUrl;

  /// True when the app runs on mock repositories only.
  final bool useMock;

  /// Prefix of every REST call made by the app (docs/architecture/MOBILE_APP_ARCHITECTURE.md §10).
  String get mobileApiBaseUrl => '$apiBaseUrl/api/mobile';

  /// Prefix of the AI Agent calls (`/homes/:id/messages|voice`), no trailing
  /// slash.
  final String agentBaseUrl;

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
