import 'dart:async';
import 'dart:convert';
import 'dart:typed_data';

import 'package:flutter_test/flutter_test.dart';
import 'package:smart_home_mobile/core/network/error_messages.dart';
import 'package:smart_home_mobile/modules/devices/data/camera_live_ws_source.dart';
import 'package:smart_home_mobile/modules/devices/domain/camera_live.dart';
// ignore: depend_on_referenced_packages
import 'package:stream_channel/stream_channel.dart';
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
    channel.clientClosedWith = closeCode;
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
  int? clientClosedWith;

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

  void serverState(String state) =>
      _incoming.add(jsonEncode({'type': 'state', 'state': state}));

  void serverFrame(List<int> bytes) => _incoming.add(Uint8List.fromList(bytes));

  void serverClose(int? code) {
    _closeCode = code;
    _incoming.close();
  }
}

Future<void> _settle([int ms = 30]) =>
    Future<void>.delayed(Duration(milliseconds: ms));

class _Harness {
  _Harness({
    this.refresh = true,
    this.silence = const Duration(seconds: 30),
    this.failConnect = false,
  }) {
    source = WebSocketCameraLiveSource(
      uriFor: (id) => cameraLiveUri('http://backend.test:5000', id),
      readAccessToken: () async => token,
      refreshSession: (rejected) async {
        rejectedTokens.add(rejected);
        refreshCalls++;
        token = 'tok2';
        return refresh;
      },
      connector: (uri) {
        uris.add(uri);
        if (failConnect) throw StateError('no network');
        final channel = _FakeChannel();
        channels.add(channel);
        return channel;
      },
      retryDelays: const [
        Duration(milliseconds: 5),
        Duration(milliseconds: 10),
        Duration(milliseconds: 15),
      ],
      silenceTimeout: silence,
    );
  }

  final bool refresh;
  final Duration silence;
  final bool failConnect;
  late final WebSocketCameraLiveSource source;
  final channels = <_FakeChannel>[];
  final uris = <Uri>[];
  final rejectedTokens = <String?>[];
  int refreshCalls = 0;
  String token = 'tok1';

  final events = <CameraLiveEvent>[];
  StreamSubscription<CameraLiveEvent>? subscription;
  bool done = false;

  void watch([int deviceId = 31]) {
    subscription = source
        .watch(deviceId)
        .listen(events.add, onDone: () => done = true);
  }

  Iterable<CameraLiveEnded> get ended => events.whereType<CameraLiveEnded>();

  List<CameraLiveState> get states => events
      .whereType<CameraLiveStateChanged>()
      .map((e) => e.state)
      .toList();
}

void main() {
  test('URL derives from the API origin and never carries the token', () {
    expect(
      cameraLiveUri('http://10.0.2.2:5000', 31).toString(),
      'ws://10.0.2.2:5000/api/mobile/cameras/31/live',
    );
    expect(
      cameraLiveUri('https://smarthome.example.com/', 7).toString(),
      'wss://smarthome.example.com/api/mobile/cameras/7/live',
    );
  });

  test('close codes: 4401 refresh, 4xxx/1000 stop, anything else retry', () {
    expect(classifyCameraLiveClose(4401), isA<CameraLiveRefreshToken>());
    expect(classifyCameraLiveClose(1006), isA<CameraLiveRetry>());
    expect(classifyCameraLiveClose(null), isA<CameraLiveRetry>());
    expect(classifyCameraLiveClose(1000), isA<CameraLiveStop>());
    for (final code in [4403, 4404, 4408, 4409, 4429, 4501, 4999]) {
      final verdict = classifyCameraLiveClose(code);
      expect(verdict, isA<CameraLiveStop>(), reason: '$code');
      final message = (verdict as CameraLiveStop).message;
      expect(message, isNotEmpty);
      expect(message, isNot(contains('$code')), reason: 'no raw code');
      expect(message, isNot(contains('tab')));
    }
  });

  test('auth frame is the first thing sent; frames and states come out', () async {
    final h = _Harness()..watch();
    await _settle();
    expect(h.channels, hasLength(1));
    expect(h.uris.single.query, isEmpty);
    expect(h.uris.single.path, '/api/mobile/cameras/31/live');
    expect(jsonDecode(h.channels[0].sent.single), {
      'type': 'auth',
      'token': 'tok1',
    });

    h.channels[0].serverState('connecting');
    h.channels[0].serverState('live');
    h.channels[0].serverFrame([0xFF, 0xD8, 1, 2, 0xFF, 0xD9]);
    h.channels[0].serverState('weird-state'); // ignored
    await _settle();

    expect(h.states, [
      CameraLiveState.connecting, // started
      CameraLiveState.connecting,
      CameraLiveState.live,
    ]);
    final frame = h.events.whereType<CameraLiveFrame>().single;
    expect(frame.bytes, [0xFF, 0xD8, 1, 2, 0xFF, 0xD9]);
    expect(h.ended, isEmpty);

    // Cancelling the subscription closes the socket (no reconnect).
    await h.subscription!.cancel();
    await _settle();
    expect(h.channels[0].clientClosedWith, 1000);
    expect(h.channels, hasLength(1));
  });

  test('4404 shows the sentence and does not reconnect', () async {
    final h = _Harness()..watch();
    await _settle();
    h.channels[0].serverClose(4404);
    await _settle(60);

    expect(h.ended.single.message, 'Không tìm thấy camera');
    expect(h.channels, hasLength(1));
    expect(h.refreshCalls, 0);
    expect(h.done, isTrue);
  });

  test('1000 ends with a plain sentence', () async {
    final h = _Harness()..watch();
    await _settle();
    h.channels[0].serverClose(1000);
    await _settle(60);
    expect(h.ended.single.message, cameraLiveEndedMessage);
    expect(h.channels, hasLength(1));
  });

  test('1006 reconnects (3 tries), then gives up with the network sentence', () async {
    final h = _Harness()..watch();
    await _settle();
    for (var i = 0; i < 4; i++) {
      expect(h.channels, hasLength(i + 1), reason: 'attempt $i');
      h.channels[i].serverClose(1006);
      await _settle(60);
    }
    expect(h.channels, hasLength(4), reason: '1 connect + 3 retries');
    expect(h.ended.single.message, networkErrorMessage);
    expect(h.states, contains(CameraLiveState.reconnecting));
    expect(h.done, isTrue);
    // Every reconnect re-sends the auth frame as the first message.
    for (final channel in h.channels) {
      expect(jsonDecode(channel.sent.first), containsPair('type', 'auth'));
    }
  });

  test('a picture resets the retry budget', () async {
    final h = _Harness()..watch();
    await _settle();
    for (var i = 0; i < 6; i++) {
      h.channels[i].serverFrame([1, 2, 3]);
      h.channels[i].serverClose(1006);
      await _settle(60);
    }
    expect(h.channels, hasLength(7));
    expect(h.ended, isEmpty);
    await h.subscription!.cancel();
  });

  test('connect failure retries, then ends with the network sentence', () async {
    final h = _Harness(failConnect: true)..watch();
    await _settle(150);
    expect(h.uris, hasLength(4));
    expect(h.ended.single.message, networkErrorMessage);
  });

  test('4401 refreshes the token and reconnects exactly once', () async {
    final h = _Harness()..watch();
    await _settle();
    h.channels[0].serverClose(4401);
    await _settle(60);

    expect(h.refreshCalls, 1);
    expect(h.rejectedTokens, ['tok1']);
    expect(h.channels, hasLength(2));
    expect(jsonDecode(h.channels[1].sent.single), {
      'type': 'auth',
      'token': 'tok2',
    });
    expect(h.ended, isEmpty);

    // A second 4401 with no picture in between stops for good.
    h.channels[1].serverClose(4401);
    await _settle(60);
    expect(h.refreshCalls, 1);
    expect(h.channels, hasLength(2));
    expect(
      h.ended.single.message,
      'Phiên đăng nhập đã hết hạn, hãy đăng nhập lại',
    );
  });

  test('after a picture, a later 4401 may refresh again', () async {
    final h = _Harness()..watch();
    await _settle();
    h.channels[0].serverClose(4401);
    await _settle(60);
    h.channels[1].serverFrame([1]);
    h.channels[1].serverClose(4401);
    await _settle(60);
    expect(h.refreshCalls, 2);
    expect(h.channels, hasLength(3));
    await h.subscription!.cancel();
  });

  test('4401 with a rejected refresh ends without reconnecting', () async {
    final h = _Harness(refresh: false)..watch();
    await _settle();
    h.channels[0].serverClose(4401);
    await _settle(60);
    expect(h.channels, hasLength(1));
    expect(h.ended.single.message, contains('Phiên đăng nhập đã hết hạn'));
  });

  test('a silent socket is treated like a drop and reconnects', () async {
    final h = _Harness(silence: const Duration(milliseconds: 40))..watch();
    await _settle(120);
    expect(h.channels.length, greaterThan(1));
    expect(h.channels[0].clientClosedWith, 1000);
    await h.subscription!.cancel();
  });
}
