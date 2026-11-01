import 'customer_profile.dart';

abstract class ProfileRepository {
  /// `GET /me/profile`.
  Future<CustomerProfile> getProfile();

  /// `PATCH /me/profile { full_name?, phone?, address? }`.
  Future<CustomerProfile> updateProfile({
    String? fullName,
    String? phone,
    String? address,
  });

  /// `POST /me/password { current_password, new_password }` → 204. The server
  /// revokes every mobile refresh token, so the caller must sign out.
  Future<void> changePassword({
    required String currentPassword,
    required String newPassword,
  });
}
