import '../../../core/utils/json.dart';
import '../domain/home_role.dart';
import '../domain/member.dart';

/// Contract §4.2 `PortalMember`.
Member memberFromJson(Json json) {
  final name = json.readString('name', fallback: 'Thành viên');
  return Member(
    id: json.readInt('id'),
    homeId: json.readIntOrNull('home_id') ?? 0,
    userId: json.readIntOrNull('user_id'),
    name: name,
    initials: json.readString('initials', fallback: _initials(name)),
    email: json.readStringOrNull('email'),
    role: HomeRole.fromApi(json.readStringOrNull('role')),
    isMe: json.readBool('is_me'),
    pending: json.readBool('pending'),
    inviteExpiresAt: json.readDateOrNull('invite_expires_at'),
    expiresAt: json.readDateOrNull('expires_at'),
    guestDeviceIds: json.readIntList('guest_device_ids'),
    joinedAt: json.readDateOrNull('joined_at'),
  );
}

/// Contract §4.2 `GET /invitations` item.
Invitation invitationFromJson(Json json) {
  final home = json.readObject('home');
  return Invitation(
    id: json.readInt('id'),
    homeId: home.readIntOrNull('id') ?? 0,
    homeName: home.readString('name', fallback: 'Smart Home'),
    homeAddress: home.readStringOrNull('address'),
    role: HomeRole.fromApi(json.readStringOrNull('role')),
    invitedByName: json.readStringOrNull('invited_by_name'),
    inviteExpiresAt: json.readDateOrNull('invite_expires_at'),
    expiresAt: json.readDateOrNull('expires_at'),
  );
}

/// Body for `POST /homes/:homeId/members/invite`.
Map<String, Object?> inviteToJson(InviteInput input) => {
  'email': input.email.trim().toLowerCase(),
  'name': input.name.trim(),
  'role': input.role.apiValue,
  if (input.expiresAt != null)
    'expires_at': input.expiresAt!.toUtc().toIso8601String(),
  if (input.deviceIds != null) 'device_ids': input.deviceIds,
};

String _initials(String name) {
  final parts = name
      .trim()
      .split(RegExp(r'\s+'))
      .where((part) => part.isNotEmpty)
      .toList();
  if (parts.isEmpty) return '?';
  if (parts.length == 1) return parts.first[0].toUpperCase();
  return '${parts.first[0]}${parts.last[0]}'.toUpperCase();
}
