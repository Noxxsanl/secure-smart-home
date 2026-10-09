import '../../../core/network/api_exception.dart';
import '../../../mock/mock_backend.dart';
import '../domain/customer_profile.dart';
import '../domain/profile_repository.dart';

class MockProfileRepository implements ProfileRepository {
  MockProfileRepository(this._backend);

  final MockBackend _backend;

  static final _phonePattern = RegExp(r'^[0-9 +.\-]{0,20}$');

  CustomerProfile _profile(MockAccount account) => CustomerProfile(
    customerId: account.customerId,
    userId: account.id,
    fullName: account.fullName,
    email: account.email,
    phone: account.phone,
    address: account.address,
    userTag: account.userTag,
    joinedAt: account.joinedAt,
  );

  @override
  Future<CustomerProfile> getProfile() =>
      _backend.respond(() => _profile(_backend.me));

  @override
  Future<CustomerProfile> updateProfile({
    String? fullName,
    String? phone,
    String? address,
  }) {
    return _backend.respond(() {
      final account = _backend.me;
      final name = fullName?.trim();
      if (name != null && (name.length < 2 || name.length > 128)) {
        _backend.invalidInput();
      }
      if (phone != null && !_phonePattern.hasMatch(phone.trim())) {
        _backend.invalidInput();
      }
      if (name != null) account.fullName = name;
      if (phone != null) {
        account.phone = phone.trim().isEmpty ? null : phone.trim();
      }
      if (address != null) {
        account.address = address.trim().isEmpty ? null : address.trim();
      }
      return _profile(account);
    });
  }

  @override
  Future<void> changePassword({
    required String currentPassword,
    required String newPassword,
  }) {
    return _backend.respond(() {
      final account = _backend.me;
      if (account.password != currentPassword) {
        throw const ApiException(
          code: ApiErrorCode.invalidCredentials,
          statusCode: 401,
        );
      }
      if (newPassword.length < 8 || newPassword.length > 128) {
        _backend.invalidInput();
      }
      account.password = newPassword;
    });
  }
}
