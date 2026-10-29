import 'dart:async';
import 'dart:convert';
import 'dart:math' as math;

import 'package:web_socket_channel/adapter_web_socket_channel.dart';
import 'package:web_socket_channel/web_socket_channel.dart';

import '../utils/json.dart';

/// Connection state of the realtime channel (FR-5.6).
enum RealtimeStatus { disconnected, connecting, connected }

/// One server → client frame after `auth_ok`, e.g. `{"type":"telemetry",…}`.
/// Typed parsing lives in the shell feature so `core` stays domain-agnostic.
class RealtimeMessage {
  const RealtimeMessage(this.type, this.data);

  final String type;
  final Json data;
}

/// A source of realtime events: the backend WebSocket, or the in-memory mock.
/// The app never talks MQTT directly (docs/architecture/MOBILE_APP_ARCHITECTURE.md §11, invariant 7).
abstract class RealtimeSource {
  Stream<RealtimeMessage> get messages;
  Stream<RealtimeStatus> get statuses;
  RealtimeStatus get status;

  Future<void> start();
  Future<void> stop();
  Future<void> dispose();
}

/// Reconnect delay: 1 s, 2 s, 4 s, 8 s, 16 s, then 30 s (docs/architecture/MOBILE_APP_ARCHITECTURE.md §11.3).
Duration backoffDelay(int attempt) =>
    Duration(seconds: math.min(30, 1 << math.min(attempt < 0 ? 0 : attempt, 5)));

/// Close code the server uses when the access token is missing/expired.
const webSocketAuthCloseCode = 4401;

typedef WebSocketConnector = WebSocketChannel Function(Uri uri);

/// `GET /api/mobile/ws` (contract §4.3).
///
/// 1. Connect, then send `{"type":"auth","token":<access JWT>}` as the first
///    frame (the token never goes in the URL).
/// 2. `auth_ok` → connected; events are forwarded to [messages].
/// 3. Close code 4401 → refresh the token once and reconnect immediately.
/// 4. Any other drop → reconnect with [backoffDelay]. While disconnected the
///    app polls REST every 15 s (handled by the realtime controller).
class WebSocketRealtimeSource implements RealtimeSource {
  WebSocketRealtimeSource({
    required this.uri,
    required this.readAccessToken,
    required this.refreshSession,
    WebSocketConnector? connector,
    this.authTimeout = const Duration(seconds: 10),
  }) : _connector = connector ?? AdapterWebSocketChannel.connect;

  final Uri uri;
  final Future<String?> Function() readAccessToken;

  /// Single-flight token refresh; receives the access token the server just
  /// rejected (so a refresh already done elsewhere is not repeated). Returns
  /// `false` when the session is over.
  final Future<bool> Function(String? rejectedToken) refreshSession;
  final Duration authTimeout;
  final WebSocketConnector _connector;
  String? _lastToken;

  final _messages = StreamController<RealtimeMessage>.broadcast();
  final _statuses = StreamController<RealtimeStatus>.broadcast();
  RealtimeStatus _status = RealtimeStatus.disconnected;

  bool _running = false;
  int _generation = 0;
  int _attempt = 0;
  int _authFailures = 0;
  WebSocketChannel? _channel;
  StreamSubscription<dynamic>? _subscription;
  Timer? _retryTimer;
  Timer? _authTimer;

  @override
  Stream<RealtimeMessage> get messages => _messages.stream;

  @override
  Stream<RealtimeStatus> get statuses => _statuses.stream;

  @override
  RealtimeStatus get status => _status;

  bool _isCurrent(int generation) => _running && generation == _generation;

  void _setStatus(RealtimeStatus next) {
    if (_status == next) return;
    _status = next;
    if (!_statuses.isClosed) _statuses.add(next);
  }

  @override
  Future<void> start() async {
    if (_running) return;
    _running = true;
    _attempt = 0;
    _authFailures = 0;
    final generation = ++_generation;
    unawaited(_connect(generation));
  }

  Future<void> _connect(int generation) async {
    if (!_isCurrent(generation)) return;
    _setStatus(RealtimeStatus.connecting);

    final String? token;
    try {
      token = await readAccessToken();
    } on Object {
      _scheduleRetry(generation);
      return;
    }
    if (!_isCurrent(generation)) return;
    if (token == null) {
      _scheduleRetry(generation);
      return;
    }
    _lastToken = token;

    final WebSocketChannel channel;
    try {
      channel = _connector(uri);
      _channel = channel;
      await channel.ready;
    } on Object {
      _channel = null;
      _scheduleRetry(generation);
      return;
    }
    if (!_isCurrent(generation)) {
      unawaited(channel.sink.close());
      return;
    }

    channel.sink.add(jsonEncode({'type': 'auth', 'token': token}));
    _authTimer?.cancel();
    _authTimer = Timer(authTimeout, () {
      if (_isCurrent(generation) && _status != RealtimeStatus.connected) {
        unawaited(channel.sink.close());
      }
    });
    _subscription = channel.stream.listen(
      (data) => _onData(generation, data),
      onError: (Object _) => _onClosed(generation, channel),
      onDone: () => _onClosed(generation, channel),
    );
  }

  void _onData(int generation, Object? data) {
    if (!_isCurrent(generation)) return;
    final Object? decoded;
    try {
      decoded = jsonDecode(
        data is String ? data : utf8.decode(data as List<int>),
      );
    } on Object {
      return;
    }
    if (decoded is! Map) return;
    final json = asJson(decoded);
    final type = json.readStringOrNull('type');
    if (type == null) return;

    if (type == 'auth_ok') {
      _authTimer?.cancel();
      _attempt = 0;
      _authFailures = 0;
      _setStatus(RealtimeStatus.connected);
      return;
    }
    // Ignore anything that arrives before the server accepted our token.
    if (_status != RealtimeStatus.connected) return;
    if (!_messages.isClosed) _messages.add(RealtimeMessage(type, json));
  }

  void _onClosed(int generation, WebSocketChannel channel) {
    if (!_isCurrent(generation) || !identical(_channel, channel)) return;
    _authTimer?.cancel();
    unawaited(_subscription?.cancel());
    _subscription = null;
    _channel = null;
    _setStatus(RealtimeStatus.disconnected);

    if (channel.closeCode == webSocketAuthCloseCode) {
      unawaited(_recoverFromAuthFailure(generation));
    } else {
      _scheduleRetry(generation);
    }
  }

  /// 4401: refresh the access token once, then reconnect right away. A second
  /// consecutive 4401 falls back to the normal backoff.
  Future<void> _recoverFromAuthFailure(int generation) async {
    _authFailures++;
    var refreshed = false;
    try {
      refreshed = await refreshSession(_lastToken);
    } on Object {
      refreshed = false;
    }
    if (!_isCurrent(generation)) return;
    if (refreshed && _authFailures <= 1) {
      unawaited(_connect(generation));
    } else {
      _scheduleRetry(generation);
    }
  }

  void _scheduleRetry(int generation) {
    if (!_isCurrent(generation)) return;
    _setStatus(RealtimeStatus.disconnected);
    final delay = backoffDelay(_attempt++);
    _retryTimer?.cancel();
    _retryTimer = Timer(delay, () => unawaited(_connect(generation)));
  }

  @override
  Future<void> stop() async {
    _running = false;
    _generation++;
    _retryTimer?.cancel();
    _authTimer?.cancel();
    final subscription = _subscription;
    final channel = _channel;
    _subscription = null;
    _channel = null;
    await subscription?.cancel();
    try {
      await channel?.sink.close(1000);
    } on Object {
      // Already closed.
    }
    _setStatus(RealtimeStatus.disconnected);
  }

  @override
  Future<void> dispose() async {
    await stop();
    await _messages.close();
    await _statuses.close();
  }
}
