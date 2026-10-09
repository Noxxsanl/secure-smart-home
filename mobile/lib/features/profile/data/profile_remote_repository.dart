import '../../../core/network/api_client.dart';
import '../../../core/utils/json.dart';
import '../domain/customer_profile.dart';
import '../domain/profile_repository.dart';
import 'profile_mapper.dart';

/// `/api/mobile/me/**` (contract §4.2).
class RemoteProfileRepository implements ProfileRepository {
  RemoteProfileRepository(this._api);

  final ApiClient _api;

  @override
  Future<CustomerProfile> getProfile() async =>
      profileFromJson(asJson(await _api.get('/me/profile')));

  @override
  Future<CustomerProfile> updateProfile({
    String? fullName,
    String? phone,
    String? address,
  }) async {
    final data = await _api.patch(
      '/me/profile',
      body: {
        if (fullName != null) 'full_name': fullName.trim(),
        if (phone != null) 'phone': phone.trim(),
        if (address != null) 'address': address.trim(),
      },
    );
    return profileFromJson(asJson(data));
  }

  @override
  Future<void> changePassword({
    required String currentPassword,
    required String newPassword,
  }) async {
    await _api.post(
      '/me/password',
      body: {
        'current_password': currentPassword,
        'new_password': newPassword,
      },
    );
  }
}
