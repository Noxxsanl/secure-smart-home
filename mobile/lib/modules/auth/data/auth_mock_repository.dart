import 'dart:math' as math;

import '../../../core/network/api_exception.dart';
import '../../../core/storage/session_storage.dart';
import '../../../mock/mock_backend.dart';
import '../domain/auth_repository.dart';
import '../domain/auth_user.dart';

/// In-memory auth for `--dart-define=USE_MOCK=true` and tests. Sessions are
/// persisted through [SessionStorage] exactly like the real app does.
class MockAuthRepository implements AuthRepository {
  MockAuthRepository(this._backend, this._storage);

  final MockBackend _backend;
  final SessionStorage _storage;

  static const _accessPrefix = 'mock-access-';
  static const _refreshPrefix = 'mock-refresh-';

  static final _emailPattern = RegExp(r'^[^@\s]+@[^@\s]+\.[^@\s]+$');
  static final _phonePattern = RegExp(r'^[0-9 +.\-]{0,20}$');

  @override
  Future<MeUser?> restoreSession() async {
    final tokens = await _storage.readTokens();
    if (tokens == null || !tokens.accessToken.startsWith(_accessPrefix)) {
      return null;
    }
    final id = int.tryParse(tokens.accessToken.substring(_accessPrefix.length));
    final account = _backend.accountById(id);
    if (account == null || account.role != 'user') {
      await _storage.clear();
      return null;
    }
    _backend.currentUserId = account.id;
    return _backend.respond(account.toMeUser);
  }

  @override
  Future<MeUser> login({
    required String email,
    required String password,
  }) async {
    final account = await _backend.respond(() {
      final found = _backend.accountByEmail(email);
      if (found == null || found.password != password) {
        throw const ApiException(
          code: ApiErrorCode.invalidCredentials,
          statusCode: 401,
        );
      }
      if (found.role != 'user') {
        throw ApiException(
          code: ApiErrorCode.useDashboard,
          statusCode: 403,
          role: found.role,
        );
      }
      return found;
    });
    return _startSession(account);
  }

  @override
  Future<MeUser> register({
    required String fullName,
    required String email,
    required String password,
    String? phone,
  }) async {
    final account = await _backend.respond(() {
      final normalized = email.trim().toLowerCase();
      final name = fullName.trim();
      final phoneValue = phone?.trim() ?? '';
      if (!_emailPattern.hasMatch(normalized) ||
          normalized.length > 190 ||
          password.length < 8 ||
          password.length > 128 ||
          name.length < 2 ||
          name.length > 128 ||
          !_phonePattern.hasMatch(phoneValue)) {
        throw const ApiException(
          code: ApiErrorCode.invalidInput,
          statusCode: 400,
        );
      }
      if (_backend.accountByEmail(normalized) != null) {
        throw const ApiException(
          code: ApiErrorCode.emailTaken,
          statusCode: 409,
        );
      }
      final nextId =
          _backend.accounts.map((a) => a.id).reduce(math.max) + 1;
      final nextCustomer =
          _backend.accounts.map((a) => a.customerId).reduce(math.max) + 1;
      final created = MockAccount(
        id: nextId,
        customerId: nextCustomer,
        email: normalized,
        password: password,
        fullName: name,
        phone: phoneValue.isEmpty ? null : phoneValue,
        userTag: _userTag(name),
        joinedAt: _backend.now,
      );
      _backend.accounts.add(created);
      return created;
    });
    return _startSession(account);
  }

  Future<MeUser> _startSession(MockAccount account) async {
    _backend.currentUserId = account.id;
    await _storage.writeTokens(
      SessionTokens(
        accessToken: '$_accessPrefix${account.id}',
        refreshToken: '$_refreshPrefix${account.id}',
      ),
    );
    return account.toMeUser();
  }

  @override
  Future<void> logout() => clearLocalSession();

  @override
  Future<void> clearLocalSession() async {
    _backend.currentUserId = null;
    await _storage.clear();
  }

  /// "Lê Quang Minh" → `minh#6073` (last word, accents folded, ≤16 chars).
  String _userTag(String fullName) {
    final words = fullName.trim().split(RegExp(r'\s+'));
    final slug = _fold(words.last)
        .toLowerCase()
        .replaceAll(RegExp(r'[^a-z0-9]'), '');
    final digits = (1000 + math.Random().nextInt(9000)).toString();
    final base = slug.isEmpty ? 'user' : slug;
    return '${base.length > 16 ? base.substring(0, 16) : base}#$digits';
  }

  static const _foldGroups = {
    'a': 'àáạảãâầấậẩẫăằắặẳẵ',
    'e': 'èéẹẻẽêềếệểễ',
    'i': 'ìíịỉĩ',
    'o': 'òóọỏõôồốộổỗơờớợởỡ',
    'u': 'ùúụủũưừứựửữ',
    'y': 'ỳýỵỷỹ',
    'd': 'đ',
  };

  String _fold(String input) {
    final buffer = StringBuffer();
    for (final char in input.toLowerCase().split('')) {
      var replaced = char;
      for (final entry in _foldGroups.entries) {
        if (entry.value.contains(char)) replaced = entry.key;
      }
      buffer.write(replaced);
    }
    return buffer.toString();
  }
}
