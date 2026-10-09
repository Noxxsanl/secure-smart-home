import 'dart:async';
import 'dart:convert';

import 'package:flutter_test/flutter_test.dart';
// ignore: depend_on_referenced_packages
import 'package:stream_channel/stream_channel.dart';
import 'package:smart_home_mobile/core/config/app_config.dart';
import 'package:smart_home_mobile/core/realtime/realtime_source.dart';
import 'package:web_socket_channel/web_socket_channel.dart';

class _Sink implements WebSocketSink {
  _Sink(this.channel);

  final _FakeChannel channel;

  @override
  void add(Object? data) => channel.sent.add(data.toString());

  @override
  void addError(Object error, [StackTrace? stackTrace]) {}

  @override
  Future<void> addStream(Stream<Object?> stream) async {}

  @override
  Future<void> close([int? closeCode, String? closeReason]) async {
    channel._closeCode ??= closeCode;
    if (!channel._incoming.isClosed) await channel._incoming.close();
  }

  @override
  Future<void> get done => channel._incoming.done;
}

class _FakeChannel extends StreamChannelMixin<dynamic>
    implements WebSocketChannel {
  final _incoming = StreamController<dynamic>();
  final sent = <String>[];
  int? _closeCode;

  @override
  Stream<dynamic> get stream => _incoming.stream;

  @override
  late final WebSocketSink sink = _Sink(this);

  @override
  Future<void> get ready => Future<void>.value();

  @override
  int? get closeCode => _closeCode;

  @override
  String? get closeReason => null;

  @override
  String? get protocol => null;

  void serverSend(Map<String, Object?> frame) => _incoming.add(jsonEncode(frame));

  void serverClose(int code) {
    _closeCode = code;
    _incoming.close();
  }
}

Future<void> _settle() => Future<void>.delayed(const Duration(milliseconds: 10));

void main() {
  test('backoff is 1,2,4,8,16 then capped at 30 seconds', () {
    expect(
      [for (var i = 0; i < 8; i++) backoffDelay(i).inSeconds],
      [1, 2, 4, 8, 16, 30, 30, 30],
    );
  });

  test('WebSocket URL derives from the API origin without the token', () {
    expect(deriveWebSocketUri('http://10.0.2.2:5000').toString(),
        'ws://10.0.2.2:5000/api/mobile/ws');
    expect(deriveWebSocketUri('https://smarthome.example.com/').toString(),
        'wss://smarthome.example.com/api/mobile/ws');
  });

  test('auth frame first, events only after auth_ok, 4401 → refresh → '
      'reconnect with the new token', () async {
    final channels = <_FakeChannel>[];
    var token = 'tok1';
    String? rejected;
    final source = WebSocketRealtimeSource(
      uri: Uri.parse('ws://backend.test/api/mobile/ws'),
      readAccessToken: () async => token,
      refreshSession: (rejectedToken) async {
        rejected = rejectedToken;
        token = 'tok2';
        return true;
      },
      connector: (uri) {
        expect(uri.query, isEmpty); // token never in the URL
        final channel = _FakeChannel();
        channels.add(channel);
        return channel;
      },
    );
    final received = <RealtimeMessage>[];
    source.messages.listen(received.add);

    await source.start();
    await _settle();
    expect(channels, hasLength(1));
    expect(jsonDecode(channels[0].sent.single), {'type': 'auth', 'token': 'tok1'});
    expect(source.status, RealtimeStatus.connecting);

    // Frames before auth_ok are ignored.
    channels[0].serverSend({'type': 'home_changed', 'home_id': 1});
    channels[0].serverSend({'type': 'auth_ok', 'user_id': 7, 'home_ids': [1]});
    await _settle();
    expect(source.status, RealtimeStatus.connected);
    channels[0].serverSend({'type': 'telemetry', 'home_id': 1});
    await _settle();
    expect(received.map((m) => m.type), ['telemetry']);

    // Server closes with 4401 (access token expired).
    channels[0].serverClose(webSocketAuthCloseCode);
    await _settle();
    expect(rejected, 'tok1');
    expect(channels, hasLength(2));
    expect(jsonDecode(channels[1].sent.single), {'type': 'auth', 'token': 'tok2'});

    await source.dispose();
  });
}
