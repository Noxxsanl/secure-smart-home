import 'package:flutter/foundation.dart';
import 'package:flutter/services.dart' show PlatformException;
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';

import '../utils/json.dart';

/// Access + refresh token pair (contract §2.4).
///
/// The refresh token rotates on every use: always persist the newest pair.
@immutable
class SessionTokens {
  const SessionTokens({required this.accessToken, required this.refreshToken});

  /// Reads `access_token` / `refresh_token` from a `TokenResponse`.
  factory SessionTokens.fromTokenResponse(Json json) {
    final access = json.readStringOrNull('access_token');
    final refresh = json.readStringOrNull('refresh_token');
    if (access == null || access.isEmpty || refresh == null || refresh.isEmpty) {
      throw const FormatException('Token response is missing tokens');
    }
    return SessionTokens(accessToken: access, refreshToken: refresh);
  }

  final String accessToken;
  final String refreshToken;

  /// Never print tokens (project invariant 2).
  @override
  String toString() => 'SessionTokens(<redacted>)';
}

/// Persists the session (FR-1.2): tokens live in the platform keystore, never
/// in plain preferences. Also remembers the last selected Smart Home.
abstract class SessionStorage {
  Future<SessionTokens?> readTokens();
  Future<void> writeTokens(SessionTokens tokens);
  Future<int?> readCurrentHomeId();
  Future<void> writeCurrentHomeId(int? homeId);

  /// Removes tokens and the remembered home (logout / expired session).
  Future<void> clear();
}

/// Keychain (iOS) / Keystore (Android) backed storage via
/// `flutter_secure_storage` (docs/07 §17).
class SecureSessionStorage implements SessionStorage {
  SecureSessionStorage({FlutterSecureStorage? storage})
    : _storage = storage ?? const FlutterSecureStorage();

  final FlutterSecureStorage _storage;

  static const _accessKey = 'smarthome.access_token';
  static const _refreshKey = 'smarthome.refresh_token';
  static const _homeKey = 'smarthome.current_home_id';

  @override
  Future<SessionTokens?> readTokens() async {
    try {
      final access = await _storage.read(key: _accessKey);
      final refresh = await _storage.read(key: _refreshKey);
      if (access == null || refresh == null) return null;
      return SessionTokens(accessToken: access, refreshToken: refresh);
    } on PlatformException {
      // Keystore key invalidated (e.g. device restore): treat as logged out.
      return null;
    }
  }

  @override
  Future<void> writeTokens(SessionTokens tokens) async {
    await _storage.write(key: _accessKey, value: tokens.accessToken);
    await _storage.write(key: _refreshKey, value: tokens.refreshToken);
  }

  @override
  Future<int?> readCurrentHomeId() async {
    try {
      return int.tryParse(await _storage.read(key: _homeKey) ?? '');
    } on PlatformException {
      return null;
    }
  }

  @override
  Future<void> writeCurrentHomeId(int? homeId) async {
    if (homeId == null) {
      await _storage.delete(key: _homeKey);
    } else {
      await _storage.write(key: _homeKey, value: homeId.toString());
    }
  }

  @override
  Future<void> clear() async {
    await _storage.delete(key: _accessKey);
    await _storage.delete(key: _refreshKey);
    await _storage.delete(key: _homeKey);
  }
}

/// In-memory storage for tests and the mock backend.
class MemorySessionStorage implements SessionStorage {
  MemorySessionStorage({this.tokens, this.homeId});

  SessionTokens? tokens;
  int? homeId;

  @override
  Future<SessionTokens?> readTokens() async => tokens;

  @override
  Future<void> writeTokens(SessionTokens value) async => tokens = value;

  @override
  Future<int?> readCurrentHomeId() async => homeId;

  @override
  Future<void> writeCurrentHomeId(int? value) async => homeId = value;

  @override
  Future<void> clear() async {
    tokens = null;
    homeId = null;
  }
}

final sessionStorageProvider = Provider<SessionStorage>(
  (ref) => SecureSessionStorage(),
);
