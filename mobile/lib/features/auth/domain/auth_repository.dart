import 'auth_user.dart';

/// Account/session operations against `/api/mobile/auth/**`.
///
/// Implementations own token persistence (FR-1.2): the UI never sees tokens.
abstract class AuthRepository {
  /// Restores the stored session: `null` when there is none or the server
  /// rejected it. Throws on transport errors so the UI can offer a retry.
  Future<MeUser?> restoreSession();

  Future<MeUser> login({required String email, required String password});

  Future<MeUser> register({
    required String fullName,
    required String email,
    required String password,
    String? phone,
  });

  /// Revokes the refresh-token family on the server (best effort) and wipes
  /// local credentials (FR-1.5). Never throws.
  Future<void> logout();

  /// Wipes local credentials only (password changed / session expired).
  Future<void> clearLocalSession();
}
