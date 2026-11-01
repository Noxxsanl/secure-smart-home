/// Public API of the homes module (homes, current home + overview, rooms,
/// members, invitations, claim) for other modules. Pages: homes_module.dart
/// (only lib/app/ imports it).
library;

export 'application/claim_providers.dart';
export 'application/homes_providers.dart';
export 'application/members_providers.dart';
export 'application/room_providers.dart';
// Contract mappers: device payloads embed home/room fields.
export 'data/home_mapper.dart';
export 'data/room_mapper.dart';
export 'domain/claim_code.dart';
export 'domain/claim_repository.dart';
export 'domain/home.dart';
export 'domain/home_repository.dart';
export 'domain/home_role.dart';
export 'domain/member.dart';
export 'domain/members_repository.dart';
export 'domain/overview.dart';
export 'domain/room.dart';
export 'domain/room_repository.dart';
export 'ui/room_card.dart';
export 'ui/room_presentation.dart';
