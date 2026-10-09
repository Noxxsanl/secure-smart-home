import 'dart:convert';

import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:smart_home_mobile/core/network/api_client.dart';
import 'package:smart_home_mobile/core/network/api_exception.dart';
import 'package:smart_home_mobile/core/storage/session_storage.dart';

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
);

Matcher _apiError(String code) =>
    isA<ApiException>().having((e) => e.code, 'code', code);

void main() {
  test('sends Bearer token, builds the query and decodes JSON', () async {
    late http.Request seen;
    final api = _client(
      MockClient((request) async {
        seen = request;
        return _json({'ok': true});
      }),
      _storage(),
    );

    final result = await api.get('/homes', query: {'limit': 5, 'skip': null});
    expect(result, {'ok': true});
    expect(seen.url.toString(), 'http://backend.test/api/mobile/homes?limit=5');
    expect(seen.headers['Authorization'], 'Bearer a1');
  });

  test('401 → ONE single-flight refresh for concurrent calls, rotated refresh '
      'token stored, each request retried once', () async {
    final storage = _storage();
    var refreshCalls = 0;
    final retried = <String>[];
    final api = _client(
      MockClient((request) async {
        if (request.url.path == '/api/mobile/auth/refresh') {
          refreshCalls++;
          expect(jsonDecode(request.body), {'refresh_token': 'r1'});
          expect(request.headers.containsKey('Authorization'), isFalse);
          await Future<void>.delayed(const Duration(milliseconds: 20));
          return _json(_tokens('a2', 'r2'));
        }
        if (request.headers['Authorization'] == 'Bearer a1') {
          return _json({'error': 'TOKEN_EXPIRED'}, 401);
        }
        retried.add('${request.url.path} ${request.headers['Authorization']}');
        return _json({'path': request.url.path});
      }),
      storage,
    );

    final results = await Future.wait([
      api.get('/homes'),
      api.get('/notifications'),
      api.get('/me/profile'),
    ]);

    expect(refreshCalls, 1);
    expect(retried, hasLength(3));
    expect(retried.every((entry) => entry.endsWith('Bearer a2')), isTrue);
    expect(results.map((r) => (r! as Map)['path']), [
      '/api/mobile/homes',
      '/api/mobile/notifications',
      '/api/mobile/me/profile',
    ]);
    final saved = await storage.readTokens();
    expect(saved?.accessToken, 'a2');
    expect(saved?.refreshToken, 'r2');
  });

  test('refresh token keeps rotating (r1 → r2 → r3)', () async {
    final storage = _storage();
    final used = <String>[];
    var validAccess = 'a1'; // the server only accepts the current access token
    final api = _client(
      MockClient((request) async {
        if (request.url.path.endsWith('/auth/refresh')) {
          final token =
              (jsonDecode(request.body) as Map)['refresh_token'] as String;
          used.add(token);
          validAccess = token == 'r1' ? 'a2' : 'a3';
          return _json(
            token == 'r1' ? _tokens('a2', 'r2') : _tokens('a3', 'r3'),
          );
        }
        return request.headers['Authorization'] == 'Bearer $validAccess'
            ? _json({'ok': 1})
            : _json({'error': 'TOKEN_EXPIRED'}, 401);
      }),
      storage,
    );

    validAccess = 'expired'; // a1 is no longer accepted
    expect(await api.get('/homes'), {'ok': 1});
    validAccess = 'expired-again'; // a2 expires 15 minutes later
    expect(await api.get('/homes'), {'ok': 1});
    expect(used, ['r1', 'r2']);
    expect((await storage.readTokens())?.refreshToken, 'r3');
  });

  test('rejected refresh clears the session, notifies once, throws '
      'SESSION_EXPIRED', () async {
    final storage = _storage();
    var expired = 0;
    var refreshCalls = 0;
    final api = _client(
      MockClient((request) async {
        if (request.url.path.endsWith('/auth/refresh')) {
          refreshCalls++;
          return _json({'error': 'REFRESH_TOKEN_REUSED'}, 401);
        }
        return _json({'error': 'TOKEN_EXPIRED'}, 401);
      }),
      storage,
      onExpired: () => expired++,
    );

    final errors = await Future.wait([
      api.get('/homes').then<Object?>((_) => null, onError: (Object e) => e),
      api
          .get('/notifications')
          .then<Object?>((_) => null, onError: (Object e) => e),
    ]);

    for (final error in errors) {
      expect(error, _apiError(ApiErrorCode.sessionExpired));
    }
    expect(refreshCalls, 1);
    expect(expired, 1);
    expect(await storage.readTokens(), isNull);
  });

  test('401 from /auth/login does not trigger a refresh', () async {
    final storage = _storage();
    var refreshCalls = 0;
    final api = _client(
      MockClient((request) async {
        if (request.url.path.endsWith('/auth/refresh')) refreshCalls++;
        return _json({'error': 'INVALID_CREDENTIALS'}, 401);
      }),
      storage,
    );

    await expectLater(
      api.post(
        '/auth/login',
        body: {'email': 'a@b.c', 'password': 'x'},
        authenticated: false,
      ),
      throwsA(_apiError('INVALID_CREDENTIALS')),
    );
    expect(refreshCalls, 0);
    expect((await storage.readTokens())?.refreshToken, 'r1');
  });

  test('business 401 (wrong current password) is not a token rejection', () async {
    var refreshCalls = 0;
    final api = _client(
      MockClient((request) async {
        if (request.url.path.endsWith('/auth/refresh')) refreshCalls++;
        return _json({'error': 'INVALID_CREDENTIALS'}, 401);
      }),
      _storage(),
    );

    await expectLater(
      api.post(
        '/me/password',
        body: {'current_password': 'x', 'new_password': 'y'},
      ),
      throwsA(_apiError('INVALID_CREDENTIALS')),
    );
    expect(refreshCalls, 0);
  });

  test('transient refresh failure (503) keeps the session', () async {
    final storage = _storage();
    var expired = 0;
    final api = _client(
      MockClient((request) async {
        if (request.url.path.endsWith('/auth/refresh')) {
          return _json({'error': 'SERVER_ERROR'}, 503);
        }
        return _json({'error': 'TOKEN_EXPIRED'}, 401);
      }),
      storage,
      onExpired: () => expired++,
    );

    await expectLater(api.get('/homes'), throwsA(isA<ApiException>()));
    expect(expired, 0);
    expect((await storage.readTokens())?.refreshToken, 'r1');
  });

  test('transport failures become NETWORK_ERROR / CLIENT_TIMEOUT', () async {
    final offline = _client(
      MockClient((_) async => throw http.ClientException('no route')),
      _storage(),
    );
    await expectLater(
      offline.get('/homes'),
      throwsA(_apiError(ApiErrorCode.networkError)),
    );

    final slow = _client(
      MockClient((_) async {
        await Future<void>.delayed(const Duration(milliseconds: 200));
        return _json({});
      }),
      _storage(),
    );
    await expectLater(
      slow.get('/homes', timeout: const Duration(milliseconds: 20)),
      throwsA(_apiError(ApiErrorCode.clientTimeout)),
    );
  });

  test('204 returns null; errors carry retry_after_seconds', () async {
    final api = _client(
      MockClient((request) async {
        if (request.method == 'DELETE') return http.Response('', 204);
        return _json({'error': 'RATE_LIMITED', 'retry_after_seconds': 300}, 429);
      }),
      _storage(),
    );
    expect(await api.delete('/members/1'), isNull);
    await expectLater(
      api.post('/claim', body: {'code': 'x'}),
      throwsA(
        isA<ApiException>().having((e) => e.retryAfterSeconds, 'retry', 300),
      ),
    );
  });
}
