import 'dart:async';

import 'package:flutter/foundation.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/config/app_config.dart';
import '../../../core/network/error_messages.dart';
import '../../../core/network/network_providers.dart';
import '../../../core/storage/session_storage.dart';
import '../../../mock/mock_providers.dart';
import '../data/auth_mock_repository.dart';
import '../data/auth_remote_repository.dart';
import '../domain/auth_repository.dart';
import '../domain/auth_user.dart';

/// Real backend or in-memory mock, chosen by `--dart-define=USE_MOCK`.
final authRepositoryProvider = Provider<AuthRepository>((ref) {
  final config = ref.watch(appConfigProvider);
  if (config.useMock) {
    return MockAuthRepository(
      ref.watch(mockBackendProvider),
      ref.watch(sessionStorageProvider),
    );
  }
  return RemoteAuthRepository(ref.watch(apiClientProvider));
});

enum AuthStatus { checking, authenticated, unauthenticated, failed }

@immutable
class AuthState {
  const AuthState._(this.status, {this.user, this.notice, this.error});

  /// Splash: restoring the stored session.
  const AuthState.checking() : this._(AuthStatus.checking);

  const AuthState.authenticated(MeUser user)
    : this._(AuthStatus.authenticated, user: user);

  /// [notice] explains why the user is back at the login screen.
  const AuthState.unauthenticated({String? notice})
    : this._(AuthStatus.unauthenticated, notice: notice);

  /// The stored session could not be verified (offline): offer a retry.
  const AuthState.failed(String error) : this._(AuthStatus.failed, error: error);

  final AuthStatus status;
  final MeUser? user;
  final String? notice;
  final String? error;
}

/// Session owner: bootstrap → login/register → logout/expiry (FR-1.x).
class AuthController extends Notifier<AuthState> {
  @override
  AuthState build() {
    final bus = ref.watch(sessionExpiryProvider);
    final subscription = bus.stream.listen((_) => handleSessionExpired());
    ref.onDispose(subscription.cancel);
    unawaited(Future<void>.microtask(restore));
    return const AuthState.checking();
  }

  /// Splash → stored session → `/auth/me`.
  Future<void> restore() async {
    if (!ref.mounted) return;
    state = const AuthState.checking();
    try {
      final user = await ref.read(authRepositoryProvider).restoreSession();
      if (!ref.mounted) return;
      // The network layer may already have reported an expired session.
      if (state.status == AuthStatus.unauthenticated) return;
      state = user == null
          ? const AuthState.unauthenticated()
          : AuthState.authenticated(user);
    } on Object catch (error) {
      if (!ref.mounted) return;
      state = AuthState.failed(userMessageFor(error));
    }
  }

  /// Throws the repository's [ApiException]; the login page maps it to text.
  Future<void> login(String email, String password) async {
    final user = await ref
        .read(authRepositoryProvider)
        .login(email: email, password: password);
    if (!ref.mounted) return;
    state = AuthState.authenticated(user);
  }

  Future<void> register({
    required String fullName,
    required String email,
    required String password,
    String? phone,
  }) async {
    final user = await ref
        .read(authRepositoryProvider)
        .register(
          fullName: fullName,
          email: email,
          password: password,
          phone: phone,
        );
    if (!ref.mounted) return;
    state = AuthState.authenticated(user);
  }

  /// FR-1.5: revoke on the server, wipe the device, back to login.
  Future<void> logout() async {
    await ref.read(authRepositoryProvider).logout();
    if (!ref.mounted) return;
    state = const AuthState.unauthenticated();
  }

  /// Wipes the local session without a server call (password just changed:
  /// every refresh token was revoked by the server).
  Future<void> signOutLocally({String? notice}) async {
    await ref.read(authRepositoryProvider).clearLocalSession();
    if (!ref.mounted) return;
    state = AuthState.unauthenticated(notice: notice);
  }

  /// Refresh token rejected: the network layer already wiped the storage.
  void handleSessionExpired() {
    if (!ref.mounted) return;
    final status = state.status;
    if (status == AuthStatus.unauthenticated) return;
    state = const AuthState.unauthenticated(
      notice: 'Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.',
    );
  }

  void updateDisplayName(String name) {
    final user = state.user;
    if (user == null) return;
    state = AuthState.authenticated(user.copyWith(displayName: name));
  }
}

final authControllerProvider = NotifierProvider<AuthController, AuthState>(
  AuthController.new,
);

/// The signed-in user's id; user-scoped providers watch it so their state is
/// dropped when somebody else logs in (or out).
final sessionUserIdProvider = Provider<int?>(
  (ref) => ref.watch(authControllerProvider.select((s) => s.user?.id)),
);
