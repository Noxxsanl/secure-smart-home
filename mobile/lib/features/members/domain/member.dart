import 'package:flutter/foundation.dart';

import '../../homes/domain/home_role.dart';

/// Contract §4.2 `PortalMember` (active member or pending invite).
@immutable
class Member {
  const Member({
    required this.id,
    required this.homeId,
    required this.name,
    required this.initials,
    required this.role,
    this.userId,
    this.email,
    this.isMe = false,
    this.pending = false,
    this.inviteExpiresAt,
    this.expiresAt,
    this.guestDeviceIds = const [],
    this.joinedAt,
  });

  final int id;
  final int homeId;
  final int? userId;
  final String name;
  final String initials;

  /// Only sent to the OWNER.
  final String? email;
  final HomeRole role;
  final bool isMe;

  /// A pending invitation (not accepted yet).
  final bool pending;
  final DateTime? inviteExpiresAt;

  /// GUEST access expiry.
  final DateTime? expiresAt;
  final List<int> guestDeviceIds;
  final DateTime? joinedAt;
}

/// An invitation addressed to me (`GET /invitations`).
@immutable
class Invitation {
  const Invitation({
    required this.id,
    required this.homeId,
    required this.homeName,
    required this.role,
    this.homeAddress,
    this.invitedByName,
    this.inviteExpiresAt,
    this.expiresAt,
  });

  final int id;
  final int homeId;
  final String homeName;
  final String? homeAddress;
  final HomeRole role;
  final String? invitedByName;
  final DateTime? inviteExpiresAt;

  /// GUEST access expiry that will apply once accepted.
  final DateTime? expiresAt;
}

/// Body of `POST /homes/:homeId/members/invite`.
@immutable
class InviteInput {
  const InviteInput({
    required this.email,
    required this.name,
    required this.role,
    this.expiresAt,
    this.deviceIds,
  });

  final String email;
  final String name;

  /// CONTROLLER, VIEWER or GUEST.
  final HomeRole role;

  /// Required for GUEST: in the future and at most 30 days away.
  final DateTime? expiresAt;

  /// Required for GUEST: at least one device of this home.
  final List<int>? deviceIds;
}

/// Maximum validity of a GUEST invitation/access (FR-6.3).
const maxGuestAccessDays = 30;
