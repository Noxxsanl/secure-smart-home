import 'dart:async';
import 'dart:convert';
import 'dart:typed_data';

import 'package:web_socket_channel/adapter_web_socket_channel.dart';
import 'package:web_socket_channel/web_socket_channel.dart';

import '../../../core/config/app_config.dart';
import '../../../core/network/error_messages.dart' show networkErrorMessage;
import '../domain/camera_live.dart';

typedef CameraLiveConnector = WebSocketChannel Function(Uri uri);

/// `http://host:5000` → `ws://host:5000/api/mobile/cameras/<id>/live`
/// (`https` → `wss`). The token is never part of the URL.
Uri cameraLiveUri(String apiBaseUrl, int deviceId) {
  final ws = deriveWebSocketUri(apiBaseUrl);
  var path = ws.path;
  if (path.endsWith('/ws')) path = path.substring(0, path.length - 3);
  return ws.replace(path: '$path/cameras/$deviceId/live');
}

/// Live camera relay over `GET /api/mobile/cameras/:id/live` (contract §4).
///
/// 1. Connect, then send `{"type":"auth","token":<access JWT>}` as the very
///    first frame (the token never goes in the URL or a log).
/// 2. Binary frame = one JPEG → [CameraLiveFrame]; text
///    `{"type":"state","state":…}` → [CameraLiveStateChanged].
/// 3. Close 4401 → refresh the token and reconnect (once, until a picture
///    arrives again); other 4xxx and 1000 → [CameraLiveEnded] with a Vietnamese
///    sentence; anything else (1006, lost network) → reconnect after 1/2/4 s,
///    then give up with the "can't reach the server" sentence.
///
/// Every [watch] opens its own connection and closes it on cancel.
class WebSocketCameraLiveSource implements CameraLiveSource {
  WebSocketCameraLiveSource({
    required this.uriFor,
    required this.readAccessToken,
    required this.refreshSession,
    CameraLiveConnector? connector,
    this.retryDelays = cameraLiveRetryDelays,
    this.silenceTimeout = const Duration(seconds: 30),
  }) : _connector = connector ?? AdapterWebSocketChannel.connect;

  final Uri Function(int deviceId) uriFor;
  final Future<String?> Function() readAccessToken;

  /// Single-flight refresh; receives the token the server just rejected.
  /// Returns `false` when the session is over.
  final Future<bool> Function(String? rejectedToken) refreshSession;
  final List<Duration> retryDelays;

  /// Nothing (picture or state) for this long on an open socket → the link is
  /// half-dead; treat it like an abnormal drop.
  final Duration silenceTimeout;
  final CameraLiveConnector _connector;

  @override
  Stream<CameraLiveEvent> watch(int deviceId) {
    late final StreamController<CameraLiveEvent> controller;
    _LiveRun? run;
    controller = StreamController<CameraLiveEvent>(
      onListen: () {
        run = _LiveRun(this, deviceId, controller)..start();
      },
      onCancel: () => run?.dispose(),
    );
    return controller.stream;
  }
}

class _LiveRun {
  _LiveRun(this._source, this._deviceId, this._out);

  final WebSocketCameraLiveSource _source;
  final int _deviceId;
  final StreamController<CameraLiveEvent> _out;

  bool _disposed = false;
  int _retries = 0;
  bool _refreshedSincePicture = false;
  String? _lastToken;
  WebSocketChannel? _channel;
  StreamSubscription<dynamic>? _subscription;
  Timer? _retryTimer;
  Timer? _silenceTimer;

  void start() {
    _emit(const CameraLiveStateChanged(CameraLiveState.connecting));
    unawaited(_open());
  }

  void _emit(CameraLiveEvent event) {
    if (!_disposed && !_out.isClosed) _out.add(event);
  }

  Future<void> _open() async {
    if (_disposed) return;
    final String? token;
    try {
      token = await _source.readAccessToken();
    } on Object {
      return _end(networkErrorMessage);
    }
    if (_disposed) return;
    if (token == null) return _end(cameraLiveCloseMessage(4401));
    _lastToken = token;

    final WebSocketChannel channel;
    try {
      channel = _source._connector(_source.uriFor(_deviceId));
      _channel = channel;
      await channel.ready;
    } on Object {
      _channel = null;
      return _retryOrEnd();
    }
    if (_disposed) {
      unawaited(_closeQuietly(channel, 1000));
      return;
    }

    channel.sink.add(jsonEncode({'type': 'auth', 'token': token}));
    _armSilenceTimer(channel);
    _subscription = channel.stream.listen(
      (data) => _onData(channel, data),
      onError: (Object _) => _onClosed(channel),
      onDone: () => _onClosed(channel),
    );
  }

  void _onData(WebSocketChannel channel, Object? data) {
    if (_disposed || !identical(_channel, channel)) return;
    _armSilenceTimer(channel);
    if (data is String) {
      final state = _parseState(data);
      if (state != null) {
        if (state == CameraLiveState.live) _markStreaming();
        _emit(CameraLiveStateChanged(state));
      }
      return;
    }
    if (data is List<int> && data.isNotEmpty) {
      _markStreaming();
      _emit(
        CameraLiveFrame(data is Uint8List ? data : Uint8List.fromList(data)),
      );
    }
  }

  /// A healthy stream resets both retry budgets.
  void _markStreaming() {
    _retries = 0;
    _refreshedSincePicture = false;
  }

  CameraLiveState? _parseState(String text) {
    try {
      final decoded = jsonDecode(text);
      if (decoded is! Map || decoded['type'] != 'state') return null;
      return CameraLiveState.fromApi(decoded['state']);
    } on FormatException {
      return null;
    }
  }

  void _armSilenceTimer(WebSocketChannel channel) {
    _silenceTimer?.cancel();
    _silenceTimer = Timer(_source.silenceTimeout, () {
      if (_disposed || !identical(_channel, channel)) return;
      // Treat as an abnormal drop: close our side and reconnect.
      _detach(channel);
      unawaited(_closeQuietly(channel, 1000));
      _retryOrEnd();
    });
  }

  void _onClosed(WebSocketChannel channel) {
    if (_disposed || !identical(_channel, channel)) return;
    final code = channel.closeCode;
    _detach(channel);
    switch (classifyCameraLiveClose(code)) {
      case CameraLiveStop(:final message):
        _end(message);
      case CameraLiveRefreshToken():
        unawaited(_recoverFromAuthClose());
      case CameraLiveRetry():
        _retryOrEnd();
    }
  }

  /// 4401: refresh once, reconnect right away. A second 4401 without a picture
  /// in between ends the stream.
  Future<void> _recoverFromAuthClose() async {
    if (_refreshedSincePicture) return _end(cameraLiveCloseMessage(4401));
    _refreshedSincePicture = true;
    var refreshed = false;
    try {
      refreshed = await _source.refreshSession(_lastToken);
    } on Object {
      if (!_disposed) _end(networkErrorMessage);
      return;
    }
    if (_disposed) return;
    if (!refreshed) return _end(cameraLiveCloseMessage(4401));
    _emit(const CameraLiveStateChanged(CameraLiveState.connecting));
    unawaited(_open());
  }

  void _retryOrEnd() {
    if (_disposed) return;
    if (_retries >= _source.retryDelays.length) {
      return _end(networkErrorMessage);
    }
    final delay = _source.retryDelays[_retries++];
    _emit(const CameraLiveStateChanged(CameraLiveState.reconnecting));
    _retryTimer?.cancel();
    _retryTimer = Timer(delay, () => unawaited(_open()));
  }

  void _detach(WebSocketChannel channel) {
    _silenceTimer?.cancel();
    unawaited(_subscription?.cancel());
    _subscription = null;
    if (identical(_channel, channel)) _channel = null;
  }

  Future<void> _closeQuietly(WebSocketChannel channel, int code) async {
    try {
      await channel.sink.close(code);
    } on Object {
      // Already closed.
    }
  }

  void _end(String message) {
    if (_disposed) return;
    _emit(CameraLiveEnded(message));
    unawaited(dispose(closeStream: true));
  }

  /// Stops everything and closes the connection (idempotent). The output
  /// stream is only closed by [_end]; on cancel the listener is already gone.
  Future<void> dispose({bool closeStream = false}) async {
    if (_disposed) return;
    _disposed = true;
    _retryTimer?.cancel();
    _silenceTimer?.cancel();
    final subscription = _subscription;
    final channel = _channel;
    _subscription = null;
    _channel = null;
    await subscription?.cancel();
    if (channel != null) await _closeQuietly(channel, 1000);
    if (closeStream && !_out.isClosed) unawaited(_out.close());
  }
}
