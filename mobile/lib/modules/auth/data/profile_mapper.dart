import '../../../core/utils/json.dart';
import '../domain/customer_profile.dart';

/// `GET /me/profile`.
CustomerProfile profileFromJson(Json json) => CustomerProfile(
  customerId: json.readIntOrNull('customer_id'),
  userId: json.readIntOrNull('user_id'),
  fullName: json.readString('full_name'),
  email: json.readStringOrNull('email'),
  phone: json.readStringOrNull('phone'),
  address: json.readStringOrNull('address'),
  userTag: json.readStringOrNull('user_tag'),
  joinedAt: json.readDateOrNull('joined_at'),
);
