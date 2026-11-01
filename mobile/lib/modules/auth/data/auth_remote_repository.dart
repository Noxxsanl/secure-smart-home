import '../../../core/network/api_client.dart';
import '../../../core/network/api_exception.dart';
import '../../../core/storage/session_storage.dart';
import '../../../core/utils/json.dart';
import '../domain/auth_repository.dart';
import '../domain/auth_user.dart';
import 'auth_mapper.dart';

/// `/api/mobile/auth/**` (contract §2.4).
class RemoteAuthRepository implements AuthRepository {
  RemoteAuthRepository(this._api);

  final ApiClient _api;

  @override
  Future<MeUser?> restoreSession() async {
    final tokens = await _api.readSession();
    if (tokens == null) return null;
    try {
      final json = asJson(await _api.get('/auth/me'));
      return meUserFromJson(json.readObject('user'));
    } on ApiException catch (error) {
      final rejected =
          error.code == ApiErrorCode.sessionExpired ||
          error.statusCode == 401 ||
          error.statusCode == 403;
      if (!rejected) rethrow;
      await _api.clearSession();
      return null;
    }
  }

  @override
  Future<MeUser> login({
    required String email,
    required String password,
  }) async {
    final json = asJson(
      await _api.post(
        '/auth/login',
        body: {'email': email.trim().toLowerCase(), 'password': password},
        authenticated: false,
      ),
    );
    return _complete(json);
  }

  @override
  Future<MeUser> register({
    required String fullName,
    required String email,
    required String password,
    String? phone,
  }) async {
    final json = asJson(
      await _api.post(
        '/auth/register',
        body: {
          'email': email.trim().toLowerCase(),
          'password': password,
          'full_name': fullName.trim(),
          if (phone != null && phone.trim().isNotEmpty) 'phone': phone.trim(),
        },
        authenticated: false,
      ),
    );
    return _complete(json);
  }

  Future<MeUser> _complete(Json json) async {
    final tokens = SessionTokens.fromTokenResponse(json);
    final user = meUserFromJson(json.readObject('user'));
    if (user.role != 'user') {
      // Defensive: the backend answers 403 USE_DASHBOARD for staff already.
      throw const ApiException(
        code: ApiErrorCode.useDashboard,
        statusCode: 403,
      );
    }
    await _api.saveSession(tokens);
    return user;
  }

  @override
  Future<void> logout() async {
    try {
      final tokens = await _api.readSession();
      if (tokens != null) {
        await _api.post(
          '/auth/logout',
          body: {'refresh_token': tokens.refreshToken},
          authenticated: false,
          timeout: const Duration(seconds: 6),
        );
      }
    } on ApiException {
      // Offline or already revoked: still wipe the device below.
    } finally {
      await _api.clearSession();
    }
  }

  @override
  Future<void> clearLocalSession() => _api.clearSession();
}
