import '../../homes/domain/home.dart';
import '../../homes/domain/home_role.dart';
import 'member.dart';

/// Members and invitations (FR-6.2 – FR-6.6).
abstract class MembersRepository {
  /// `GET /homes/:homeId/members` (pending invites only for the OWNER).
  Future<List<Member>> list(int homeId);

  /// `POST /homes/:homeId/members/invite` (OWNER).
  Future<Member> invite(int homeId, InviteInput input);

  /// `PATCH /members/:memberId` (OWNER; target is not the OWNER).
  Future<Member> update(
    int memberId, {
    HomeRole? role,
    DateTime? expiresAt,
    List<int>? deviceIds,
  });

  /// `DELETE /members/:memberId` (OWNER; also cancels a pending invite).
  Future<void> remove(int memberId);

  /// `POST /homes/:homeId/leave` (non-owner).
  Future<void> leave(int homeId);

  /// `GET /invitations`.
  Future<List<Invitation>> myInvitations();

  /// `POST /invitations/:id/accept` → the home I joined.
  Future<MyHome> acceptInvitation(int invitationId);

  /// `POST /invitations/:id/decline`.
  Future<void> declineInvitation(int invitationId);
}
