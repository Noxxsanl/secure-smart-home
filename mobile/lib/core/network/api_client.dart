import 'dart:async';
import 'dart:convert';

import 'package:http/http.dart' as http;

import '../storage/session_storage.dart';
import '../utils/json.dart';
import 'api_exception.dart';

/// HTTP client for `/api/mobile/**` (docs/07 §10).
///
/// - JSON in/out, `Authorization: Bearer <access token>`.
/// - On a 401 token rejection (`NO_TOKEN`, `INVALID_TOKEN`, `TOKEN_EXPIRED`)
///   from a non-`/auth/*` request it performs ONE single-flight refresh
///   (`POST /auth/refresh`), persists the rotated refresh token and retries the
///   request once. If the refresh is rejected the session is cleared and
///   [onSessionExpired] fires.
/// - Never logs request/response bodies (they can contain passwords/tokens).
class ApiClient {
  ApiClient({
    required String baseUrl,
    required http.Client httpClient,
    required SessionStorage storage,
    this.onSessionExpired,
    this.timeout = const Duration(seconds: 15),
  }) : baseUrl = baseUrl.endsWith('/')
           ? baseUrl.substring(0, baseUrl.length - 1)
           : baseUrl,
       _http = httpClient,
       // ignore: prefer_initializing_formals
       _storage = storage;

  /// e.g. `http://10.0.2.2:5000/api/mobile` (no trailing slash).
  final String baseUrl;

  /// Default per-request timeout.
  final Duration timeout;

  /// Called once when the refresh token is rejected and the session was wiped.
  final void Function()? onSessionExpired;

  final http.Client _http;
  final SessionStorage _storage;

  SessionTokens? _tokens;
  bool _loaded = false;
  Future<bool>? _refreshing;

  // ---------------------------------------------------------------- session

  Future<SessionTokens?> readSession() async {
    if (!_loaded) {
      _tokens = await _storage.readTokens();
      _loaded = true;
    }
    return _tokens;
  }

  /// Stores a freshly issued token pair (login, register, refresh).
  Future<void> saveSession(SessionTokens tokens) async {
    _tokens = tokens;
    _loaded = true;
    await _storage.writeTokens(tokens);
  }

  /// Wipes local credentials without notifying [onSessionExpired].
  Future<void> clearSession() async {
    _tokens = null;
    _loaded = true;
    await _storage.clear();
  }

  /// The current access token (for the WebSocket auth frame), or `null`.
  Future<String?> currentAccessToken() async =>
      (await readSession())?.accessToken;

  /// Single-flight token refresh. All concurrent callers share one
  /// `POST /auth/refresh`. [staleAccessToken] is the token the failed request
  /// was sent with; if the stored token already differs, another caller has
  /// refreshed and this returns `true` without a network call.
  ///
  /// Returns `false` (after clearing the session and notifying
  /// [onSessionExpired]) when the server rejects the refresh token. Throws an
  /// [ApiException] for transient failures (offline, 5xx, 429) and keeps the
  /// session so the user is not logged out by a bad network.
  Future<bool> refreshSession({String? staleAccessToken}) async {
    final tokens = await readSession();
    if (tokens == null) {
      await _expire(notify: true);
      return false;
    }
    if (staleAccessToken != null && tokens.accessToken != staleAccessToken) {
      return true;
    }
    final inFlight = _refreshing;
    if (inFlight != null) return inFlight;
    final future = _doRefresh(tokens.refreshToken).whenComplete(() {
      _refreshing = null;
    });
    _refreshing = future;
    return future;
  }

  Future<bool> _doRefresh(String refreshToken) async {
    final response = await _send(
      'POST',
      '/auth/refresh',
      body: {'refresh_token': refreshToken},
    );
    final status = response.statusCode;
    if (status >= 200 && status < 300) {
      final SessionTokens next;
      try {
        next = SessionTokens.fromTokenResponse(asJson(_tryDecode(response)));
      } on FormatException {
        throw const ApiException(code: ApiErrorCode.invalidResponse);
      }
      // Always keep the rotated refresh token: the old one is now revoked.
      _tokens = next;
      _loaded = true;
      try {
        await _storage.writeTokens(next);
      } on Object {
        // Keep working in memory; the next launch will ask for a login.
      }
      return true;
    }
    if (status == 429 || status >= 500) {
      throw ApiException.fromHttp(
        status,
        _tryDecode(response),
        retryAfterHeader: response.headers['retry-after'],
      );
    }
    await _expire(notify: true);
    return false;
  }

  Future<void> _expire({required bool notify}) async {
    _tokens = null;
    _loaded = true;
    try {
      await _storage.clear();
    } on Object {
      // Nothing else to do: memory is already cleared.
    }
    if (notify) onSessionExpired?.call();
  }

  // ---------------------------------------------------------------- requests

  Future<Object?> get(
    String path, {
    Map<String, Object?>? query,
    Duration? timeout,
  }) => _request('GET', path, query: query, timeout: timeout);

  /// [authenticated] = false for `/auth/login|register|refresh|logout`.
  Future<Object?> post(
    String path, {
    Object? body,
    Duration? timeout,
    bool authenticated = true,
  }) => _request(
    'POST',
    path,
    body: body,
    timeout: timeout,
    authenticated: authenticated,
  );

  Future<Object?> patch(String path, {Object? body, Duration? timeout}) =>
      _request('PATCH', path, body: body, timeout: timeout);

  Future<Object?> delete(String path, {Duration? timeout}) =>
      _request('DELETE', path, timeout: timeout);

  Future<Object?> _request(
    String method,
    String path, {
    Object? body,
    Map<String, Object?>? query,
    Duration? timeout,
    bool authenticated = true,
  }) async {
    final tokens = authenticated ? await readSession() : null;
    var response = await _send(
      method,
      path,
      body: body,
      query: query,
      timeout: timeout,
      accessToken: tokens?.accessToken,
    );

    if (authenticated &&
        response.statusCode == 401 &&
        _isTokenRejection(response)) {
      final refreshed = await refreshSession(
        staleAccessToken: tokens?.accessToken,
      );
      if (!refreshed) {
        throw const ApiException(
          code: ApiErrorCode.sessionExpired,
          statusCode: 401,
        );
      }
      final fresh = await readSession();
      response = await _send(
        method,
        path,
        body: body,
        query: query,
        timeout: timeout,
        accessToken: fresh?.accessToken,
      );
      if (response.statusCode == 401 && _isTokenRejection(response)) {
        // A brand-new token was refused too: the account is gone/locked.
        await _expire(notify: true);
        throw const ApiException(
          code: ApiErrorCode.sessionExpired,
          statusCode: 401,
        );
      }
    }
    return _parse(response);
  }

  Future<http.Response> _send(
    String method,
    String path, {
    Object? body,
    Map<String, Object?>? query,
    Duration? timeout,
    String? accessToken,
  }) async {
    final uri = _uri(path, query);
    final headers = <String, String>{
      'Accept': 'application/json',
      if (body != null) 'Content-Type': 'application/json',
      if (accessToken != null) 'Authorization': 'Bearer $accessToken',
    };
    final encoded = body == null ? null : jsonEncode(body);
    try {
      final Future<http.Response> request = switch (method) {
        'GET' => _http.get(uri, headers: headers),
        'POST' => _http.post(uri, headers: headers, body: encoded),
        'PATCH' => _http.patch(uri, headers: headers, body: encoded),
        'DELETE' => _http.delete(uri, headers: headers, body: encoded),
        _ => throw ArgumentError('Unsupported HTTP method: $method'),
      };
      return await request.timeout(timeout ?? this.timeout);
    } on TimeoutException {
      throw const ApiException(code: ApiErrorCode.clientTimeout);
    } on Exception {
      throw const ApiException(code: ApiErrorCode.networkError);
    }
  }

  Uri _uri(String path, Map<String, Object?>? query) {
    final base = Uri.parse('$baseUrl$path');
    final params = <String, String>{
      ...base.queryParameters,
      if (query != null)
        for (final entry in query.entries)
          if (entry.value != null) entry.key: entry.value.toString(),
    };
    return params.isEmpty ? base : base.replace(queryParameters: params);
  }

  bool _isTokenRejection(http.Response response) {
    final error = ApiException.fromHttp(
      response.statusCode,
      _tryDecode(response),
    );
    return ApiErrorCode.tokenRejections.contains(error.code);
  }

  Object? _tryDecode(http.Response response) {
    if (response.bodyBytes.isEmpty) return null;
    try {
      return jsonDecode(utf8.decode(response.bodyBytes, allowMalformed: true));
    } on FormatException {
      return null;
    }
  }

  Object? _parse(http.Response response) {
    final body = _tryDecode(response);
    if (response.statusCode < 200 || response.statusCode >= 300) {
      throw ApiException.fromHttp(
        response.statusCode,
        body,
        retryAfterHeader: response.headers['retry-after'],
      );
    }
    return body;
  }
}
