import '../../../core/utils/json.dart';
import '../domain/auth_user.dart';

/// Contract §2.1 `MeUser`.
MeUser meUserFromJson(Json json) {
  final username = json.readStringOrNull('username');
  final email = json.readStringOrNull('email');
  final displayName = json.readStringOrNull('display_name');
  return MeUser(
    id: json.readInt('id'),
    role: json.readString('role', fallback: 'user'),
    username: username,
    email: email,
    displayName: (displayName != null && displayName.trim().isNotEmpty)
        ? displayName.trim()
        : (username ?? email ?? 'Khách hàng'),
    customerId: json.readIntOrNull('customer_id'),
    userTag: json.readStringOrNull('user_tag'),
  );
}
