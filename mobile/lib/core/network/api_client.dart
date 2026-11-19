import 'dart:async';
import 'dart:convert';
import 'dart:typed_data';

import 'package:http/http.dart' as http;

import '../storage/session_storage.dart';
import '../utils/json.dart';
import 'api_exception.dart';

/// HTTP client for `/api/mobile/**` (docs/architecture/MOBILE_APP_ARCHITECTURE.md §10).
///
/// - JSON in/out, `Authorization: Bearer <access token>`.
/// - On a 401 token rejection (`NO_TOKEN`, `INVALID_TOKEN`, `TOKEN_EXPIRED`)
///   from a non-`/auth/*` request it performs ONE single-flight refresh
///   (`POST /auth/refresh`), persists the rotated refresh token and retries the
///   request once. If the refresh is rejected the session is cleared and
///   [onSessionExpired] fires.
/// - Absolute-URL calls ([postUrl], [postBytesUrl]) reach the AI Agent behind
///   the same origin: same Bearer token and refresh handling, but the agent
///   reports an expired access token as `401 SESSION_EXPIRED`, which also
///   triggers the single refresh + retry.
/// - Never logs request/response bodies (they can contain passwords/tokens,
///   voice recordings or what the user said).
class ApiClient {
  /// 401 codes that mean "refresh the session" on an AI Agent call: the
  /// backend ones plus the agent's own `SESSION_EXPIRED`.
  static const agentTokenRejections = {
    ...ApiErrorCode.tokenRejections,
    ApiErrorCode.sessionExpired,
  };

  /// [trustedOrigins]: other API origins (e.g. the AI Agent's
  /// `AppConfig.agentBaseUrl`) that [postUrl] / [postBytesUrl] may call with
  /// the Bearer token; any other absolute URL is refused so the token never
  /// leaves the configured servers.
  ApiClient({
    required String baseUrl,
    required http.Client httpClient,
    required SessionStorage storage,
    this.onSessionExpired,
    this.timeout = const Duration(seconds: 15),
    Iterable<String> trustedOrigins = const <String>[],
  }) : baseUrl = baseUrl.endsWith('/')
           ? baseUrl.substring(0, baseUrl.length - 1)
           : baseUrl,
       _trustedOrigins = {
         Uri.parse(baseUrl).origin,
         for (final url in trustedOrigins) Uri.parse(url).origin,
       },
       _http = httpClient,
       // ignore: prefer_initializing_formals
       _storage = storage;

  /// Origins (`scheme://host[:port]`) an absolute URL may point at.
  final Set<String> _trustedOrigins;

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

  /// `POST` to an absolute [url] outside `/api/mobile` (the AI Agent, e.g.
  /// `http://host/api/agent/homes/1/messages`) with the session Bearer token.
  /// A `401` with `SESSION_EXPIRED`/`NO_TOKEN`/`INVALID_TOKEN`/`TOKEN_EXPIRED`
  /// refreshes the session and re-sends the request exactly once.
  Future<Object?> postUrl(
    String url, {
    Object? body,
    Map<String, Object?>? query,
    Duration? timeout,
  }) async {
    final response = await _execute(
      'POST',
      url,
      body: body,
      query: query,
      timeout: timeout,
      absolute: true,
      rejections: agentTokenRejections,
    );
    return _parse(response);
  }

  /// Like [postUrl] with a raw [bytes] body (a voice recording) sent as
  /// [contentType] plus optional [headers]. The same bytes are re-sent after a
  /// session refresh.
  Future<Object?> postBytesUrl(
    String url, {
    required List<int> bytes,
    required String contentType,
    Map<String, String>? headers,
    Map<String, Object?>? query,
    Duration? timeout,
  }) async {
    final response = await _execute(
      'POST',
      url,
      rawBody: bytes,
      contentType: contentType,
      extraHeaders: headers,
      query: query,
      timeout: timeout,
      absolute: true,
      rejections: agentTokenRejections,
    );
    return _parse(response);
  }

  /// Downloads a binary body (e.g. a camera JPEG) with the same Bearer +
  /// single refresh-and-retry handling as JSON calls, so the image URL needs no
  /// token handling in the UI. Non-2xx → [ApiException].
  Future<Uint8List> getBytes(
    String path, {
    Map<String, Object?>? query,
    Duration? timeout,
  }) async {
    final response = await _execute(
      'GET',
      path,
      query: query,
      timeout: timeout,
      accept: 'image/*',
    );
    _throwIfFailed(response);
    return response.bodyBytes;
  }

  Future<Object?> _request(
    String method,
    String path, {
    Object? body,
    Map<String, Object?>? query,
    Duration? timeout,
    bool authenticated = true,
  }) async {
    final response = await _execute(
      method,
      path,
      body: body,
      query: query,
      timeout: timeout,
      authenticated: authenticated,
    );
    return _parse(response);
  }

  Future<http.Response> _execute(
    String method,
    String path, {
    Object? body,
    Map<String, Object?>? query,
    Duration? timeout,
    bool authenticated = true,
    String accept = 'application/json',
    bool absolute = false,
    List<int>? rawBody,
    String? contentType,
    Map<String, String>? extraHeaders,
    Set<String> rejections = ApiErrorCode.tokenRejections,
  }) async {
    final tokens = authenticated ? await readSession() : null;
    var response = await _send(
      method,
      path,
      body: body,
      query: query,
      timeout: timeout,
      accessToken: tokens?.accessToken,
      accept: accept,
      absolute: absolute,
      rawBody: rawBody,
      contentType: contentType,
      extraHeaders: extraHeaders,
    );

    if (authenticated &&
        response.statusCode == 401 &&
        _isTokenRejection(response, rejections)) {
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
        accept: accept,
        absolute: absolute,
        rawBody: rawBody,
        contentType: contentType,
        extraHeaders: extraHeaders,
      );
      if (response.statusCode == 401 &&
          _isTokenRejection(response, rejections)) {
        // A brand-new token was refused too: the account is gone/locked.
        await _expire(notify: true);
        throw const ApiException(
          code: ApiErrorCode.sessionExpired,
          statusCode: 401,
        );
      }
    }
    return response;
  }

  Future<http.Response> _send(
    String method,
    String path, {
    Object? body,
    Map<String, Object?>? query,
    Duration? timeout,
    String? accessToken,
    String accept = 'application/json',
    bool absolute = false,
    List<int>? rawBody,
    String? contentType,
    Map<String, String>? extraHeaders,
  }) async {
    final uri = _uri(path, query, absolute: absolute);
    final headers = <String, String>{
      'Accept': accept,
      ...?extraHeaders,
      if (rawBody != null && contentType != null) 'Content-Type': contentType,
      if (body != null) 'Content-Type': 'application/json',
      if (accessToken != null) 'Authorization': 'Bearer $accessToken',
    };
    final Object? encoded = rawBody ?? (body == null ? null : jsonEncode(body));
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

  Uri _uri(String path, Map<String, Object?>? query, {bool absolute = false}) {
    final base = Uri.parse(absolute ? path : '$baseUrl$path');
    if (absolute &&
        !((base.isScheme('http') || base.isScheme('https')) &&
            base.host.isNotEmpty &&
            _trustedOrigins.contains(base.origin))) {
      // Programming/configuration error: never attach the Bearer token to a
      // server that is not one of ours.
      throw ArgumentError.value(path, 'url', 'not a configured API origin');
    }
    final params = <String, String>{
      ...base.queryParameters,
      if (query != null)
        for (final entry in query.entries)
          if (entry.value != null) entry.key: entry.value.toString(),
    };
    return params.isEmpty ? base : base.replace(queryParameters: params);
  }

  bool _isTokenRejection(http.Response response, Set<String> codes) {
    final error = ApiException.fromHttp(
      response.statusCode,
      _tryDecode(response),
    );
    return codes.contains(error.code);
  }

  Object? _tryDecode(http.Response response) {
    if (response.bodyBytes.isEmpty) return null;
    try {
      return jsonDecode(utf8.decode(response.bodyBytes, allowMalformed: true));
    } on FormatException {
      return null;
    }
  }

  void _throwIfFailed(http.Response response) {
    if (response.statusCode >= 200 && response.statusCode < 300) return;
    throw ApiException.fromHttp(
      response.statusCode,
      _tryDecode(response),
      retryAfterHeader: response.headers['retry-after'],
    );
  }

  Object? _parse(http.Response response) {
    _throwIfFailed(response);
    return _tryDecode(response);
  }
}
