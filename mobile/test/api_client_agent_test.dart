import 'dart:convert';

import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:smart_home_mobile/core/network/api_client.dart';
import 'package:smart_home_mobile/core/network/api_exception.dart';
import 'package:smart_home_mobile/core/storage/session_storage.dart';

// Calls to the AI Agent go to an absolute URL (outside /api/mobile) with the
// same Bearer token; the agent reports an expired access token as
// `401 SESSION_EXPIRED`, which must refresh the session and re-send ONCE.

const _agent = 'http://agent.test/api/agent';

http.Response _json(Object body, [int status = 200]) => http.Response(
  jsonEncode(body),
  status,
  headers: {'content-type': 'application/json'},
);

Map<String, Object?> _tokens(String access, String refresh) => {
  'access_token': access,
  'refresh_token': refresh,
  'token_type': 'Bearer',
  'expires_in': 900,
  'refresh_expires_in': 2592000,
  'user': {'id': 7, 'role': 'user'},
};

MemorySessionStorage _storage() => MemorySessionStorage(
  tokens: const SessionTokens(accessToken: 'a1', refreshToken: 'r1'),
);

ApiClient _client(
  MockClient mock,
  MemorySessionStorage storage, {
  void Function()? onExpired,
}) => ApiClient(
  baseUrl: 'http://backend.test/api/mobile',
  httpClient: mock,
  storage: storage,
  onSessionExpired: onExpired,
  trustedOrigins: const [_agent],
);

Matcher _apiError(String code) =>
    isA<ApiException>().having((e) => e.code, 'code', code);

void main() {
  test(
    'postUrl sends JSON to the absolute URL with the Bearer token',
    () async {
      late http.Request seen;
      final api = _client(
        MockClient((request) async {
          seen = request;
          return _json({'ok': true});
        }),
        _storage(),
      );

      final result = await api.postUrl(
        '$_agent/homes/1/messages',
        body: {'text': 'Bật đèn'},
      );
      expect(result, {'ok': true});
      expect(seen.url.toString(), '$_agent/homes/1/messages');
      expect(seen.headers['Authorization'], 'Bearer a1');
      expect(seen.headers['Content-Type'], startsWith('application/json'));
      expect(jsonDecode(utf8.decode(seen.bodyBytes)), {'text': 'Bật đèn'});
    },
  );

  test(
    'an absolute URL outside the configured origins never gets the token',
    () async {
      var calls = 0;
      final api = _client(
        MockClient((request) async {
          calls++;
          return _json({'ok': true});
        }),
        _storage(),
      );

      for (final url in [
        'http://evil.test/api/agent/homes/1/messages',
        // Same host, other port = other origin.
        'http://agent.test:8080/api/agent/homes/1/messages',
        'https://agent.test/api/agent/homes/1/messages',
        'ftp://agent.test/x',
      ]) {
        await expectLater(
          api.postUrl(url, body: {'text': 'x'}),
          throwsArgumentError,
        );
        await expectLater(
          api.postBytesUrl(url, bytes: const [1, 2], contentType: 'audio/wav'),
          throwsArgumentError,
        );
      }
      expect(calls, 0);
      // The backend's own origin stays allowed.
      await api.postUrl('http://backend.test/api/mobile/x');
      expect(calls, 1);
    },
  );

  for (final code in ['SESSION_EXPIRED', 'NO_TOKEN']) {
    test(
      'agent 401 $code → refresh once, re-send once with the new token',
      () async {
        final storage = _storage();
        var refreshCalls = 0;
        final sent = <String>[];
        final api = _client(
          MockClient((request) async {
            if (request.url.path == '/api/mobile/auth/refresh') {
              refreshCalls++;
              return _json(_tokens('a2', 'r2'));
            }
            sent.add(request.headers['Authorization'] ?? '');
            if (request.headers['Authorization'] == 'Bearer a1') {
              return _json({'error': code, 'message': 'x'}, 401);
            }
            return _json({'conversation_id': 'c1'});
          }),
          storage,
        );

        final result = await api.postUrl(
          '$_agent/homes/1/messages',
          body: {'text': 'hi'},
        );
        expect(result, {'conversation_id': 'c1'});
        expect(refreshCalls, 1);
        expect(sent, ['Bearer a1', 'Bearer a2']);
        final saved = await storage.readTokens();
        expect(saved?.refreshToken, 'r2');
      },
    );
  }

  test('a second SESSION_EXPIRED after the refresh ends the session', () async {
    var refreshCalls = 0;
    var expired = 0;
    var agentCalls = 0;
    final api = _client(
      MockClient((request) async {
        if (request.url.path.endsWith('/auth/refresh')) {
          refreshCalls++;
          return _json(_tokens('a2', 'r2'));
        }
        agentCalls++;
        return _json({'error': 'SESSION_EXPIRED'}, 401);
      }),
      _storage(),
      onExpired: () => expired++,
    );

    await expectLater(
      api.postUrl('$_agent/homes/1/messages', body: {'text': 'hi'}),
      throwsA(_apiError(ApiErrorCode.sessionExpired)),
    );
    expect(refreshCalls, 1);
    expect(agentCalls, 2); // never a third send
    expect(expired, 1);
  });

  test('a rejected refresh token ends the session without a retry', () async {
    var agentCalls = 0;
    var expired = 0;
    final api = _client(
      MockClient((request) async {
        if (request.url.path.endsWith('/auth/refresh')) {
          return _json({'error': 'INVALID_REFRESH_TOKEN'}, 401);
        }
        agentCalls++;
        return _json({'error': 'SESSION_EXPIRED'}, 401);
      }),
      _storage(),
      onExpired: () => expired++,
    );

    await expectLater(
      api.postUrl('$_agent/homes/1/messages', body: {'text': 'hi'}),
      throwsA(_apiError(ApiErrorCode.sessionExpired)),
    );
    expect(agentCalls, 1);
    expect(expired, 1);
  });

  test('other agent errors are not retried', () async {
    var calls = 0;
    final api = _client(
      MockClient((request) async {
        calls++;
        return _json({'error': 'RATE_LIMITED'}, 429);
      }),
      _storage(),
    );
    await expectLater(
      api.postUrl('$_agent/homes/1/messages', body: {'text': 'hi'}),
      throwsA(_apiError('RATE_LIMITED')),
    );
    expect(calls, 1);
  });

  test('postBytesUrl sends the audio, headers and query, and re-sends the same '
      'bytes after a refresh', () async {
    final audio = List<int>.generate(64, (i) => i);
    final seen = <http.Request>[];
    final api = _client(
      MockClient((request) async {
        if (request.url.path.endsWith('/auth/refresh')) {
          return _json(_tokens('a2', 'r2'));
        }
        seen.add(request);
        if (request.headers['Authorization'] == 'Bearer a1') {
          return _json({'error': 'SESSION_EXPIRED'}, 401);
        }
        return _json({'transcript': 'bật đèn'});
      }),
      _storage(),
    );

    final result = await api.postBytesUrl(
      '$_agent/homes/1/voice',
      bytes: audio,
      contentType: 'audio/wav',
      headers: {'X-Audio-Duration-Ms': '2500'},
      query: {'conversation_id': 'c9', 'skipped': null},
    );
    expect(result, {'transcript': 'bật đèn'});
    expect(seen, hasLength(2));
    for (final request in seen) {
      expect(
        request.url.toString(),
        '$_agent/homes/1/voice?conversation_id=c9',
      );
      expect(request.headers['Content-Type'], 'audio/wav');
      expect(request.headers['X-Audio-Duration-Ms'], '2500');
      expect(request.bodyBytes, audio);
    }
    expect(seen.last.headers['Authorization'], 'Bearer a2');
  });

  test(
    'a /api/mobile call does NOT refresh on SESSION_EXPIRED (unchanged)',
    () async {
      var refreshCalls = 0;
      final api = _client(
        MockClient((request) async {
          if (request.url.path.endsWith('/auth/refresh')) {
            refreshCalls++;
            return _json(_tokens('a2', 'r2'));
          }
          return _json({'error': 'SESSION_EXPIRED'}, 401);
        }),
        _storage(),
      );
      await expectLater(
        api.get('/homes'),
        throwsA(_apiError(ApiErrorCode.sessionExpired)),
      );
      expect(refreshCalls, 0);
    },
  );
}
