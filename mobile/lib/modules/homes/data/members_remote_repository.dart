import '../../../core/network/api_client.dart';
import '../../../core/utils/json.dart';
import '../domain/home.dart';
import '../domain/home_role.dart';
import '../domain/member.dart';
import '../domain/members_repository.dart';
import 'home_mapper.dart';
import 'member_mapper.dart';

/// Members and invitations (contract §4.2).
class RemoteMembersRepository implements MembersRepository {
  RemoteMembersRepository(this._api);

  final ApiClient _api;

  @override
  Future<List<Member>> list(int homeId) async {
    final data = await _api.get('/homes/$homeId/members');
    return asJsonList(data).map(memberFromJson).toList();
  }

  @override
  Future<Member> invite(int homeId, InviteInput input) async {
    final data = await _api.post(
      '/homes/$homeId/members/invite',
      body: inviteToJson(input),
    );
    return memberFromJson(asJson(data));
  }

  @override
  Future<Member> update(
    int memberId, {
    HomeRole? role,
    DateTime? expiresAt,
    List<int>? deviceIds,
  }) async {
    final data = await _api.patch(
      '/members/$memberId',
      body: {
        if (role != null) 'role': role.apiValue,
        if (expiresAt != null) 'expires_at': expiresAt.toUtc().toIso8601String(),
        'device_ids': ?deviceIds,
      },
    );
    return memberFromJson(asJson(data));
  }

  @override
  Future<void> remove(int memberId) async {
    await _api.delete('/members/$memberId');
  }

  @override
  Future<void> leave(int homeId) async {
    await _api.post('/homes/$homeId/leave');
  }

  @override
  Future<List<Invitation>> myInvitations() async {
    final data = await _api.get('/invitations');
    return asJsonList(data).map(invitationFromJson).toList();
  }

  @override
  Future<MyHome> acceptInvitation(int invitationId) async {
    final data = await _api.post('/invitations/$invitationId/accept');
    return myHomeFromJson(asJson(data));
  }

  @override
  Future<void> declineInvitation(int invitationId) async {
    await _api.post('/invitations/$invitationId/decline');
  }
}
