import 'dart:async';

import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../../core/config/app_config.dart';
import '../../../../core/network/api_exception.dart';
import '../../../../core/network/network_providers.dart';
import '../../../../mock/mock_providers.dart';
import '../../../auth/presentation/providers/auth_providers.dart';
import '../../../homes/domain/home_role.dart';
import '../../../homes/presentation/providers/homes_providers.dart';
import '../../data/members_mock_repository.dart';
import '../../data/members_remote_repository.dart';
import '../../domain/member.dart';
import '../../domain/members_repository.dart';

final membersRepositoryProvider = Provider<MembersRepository>((ref) {
  final config = ref.watch(appConfigProvider);
  if (config.useMock) {
    return MockMembersRepository(ref.watch(mockBackendProvider));
  }
  return RemoteMembersRepository(ref.watch(apiClientProvider));
});

/// Members of one home (FR-6.2 – 6.4). Pending invitations are included for
/// the OWNER only.
class MembersNotifier extends AsyncNotifier<List<Member>> {
  MembersNotifier(this.homeId);

  final int homeId;

  @override
  Future<List<Member>> build() {
    final userId = ref.watch(sessionUserIdProvider);
    final repository = ref.watch(membersRepositoryProvider);
    if (userId == null) {
      return Future<List<Member>>.error(
        const ApiException(code: ApiErrorCode.sessionExpired),
      );
    }
    return repository.list(homeId);
  }

  Future<void> refresh({bool throwOnError = false}) async {
    try {
      final members = await ref.read(membersRepositoryProvider).list(homeId);
      if (!ref.mounted) return;
      state = AsyncData(members);
    } on Object {
      if (throwOnError) rethrow;
    }
  }

  Future<void> invite(InviteInput input) async {
    await ref.read(membersRepositoryProvider).invite(homeId, input);
    await refresh();
  }

  Future<void> changeRole(
    int memberId, {
    HomeRole? role,
    DateTime? expiresAt,
    List<int>? deviceIds,
  }) async {
    await ref
        .read(membersRepositoryProvider)
        .update(memberId, role: role, expiresAt: expiresAt, deviceIds: deviceIds);
    await refresh();
  }

  Future<void> remove(int memberId) async {
    await ref.read(membersRepositoryProvider).remove(memberId);
    await refresh();
  }

  /// Non-owners leave the home; the home list then drops it (and the app falls
  /// back to another home or the onboarding screen).
  Future<void> leave() async {
    final homes = ref.read(homesProvider.notifier);
    await ref.read(membersRepositoryProvider).leave(homeId);
    await homes.refresh();
  }
}

final membersProvider = AsyncNotifierProvider.autoDispose
    .family<MembersNotifier, List<Member>, int>(MembersNotifier.new);

/// Invitations addressed to me (FR-6.6).
class InvitationsNotifier extends AsyncNotifier<List<Invitation>> {
  @override
  Future<List<Invitation>> build() async {
    final userId = ref.watch(sessionUserIdProvider);
    final repository = ref.watch(membersRepositoryProvider);
    if (userId == null) return const [];
    return repository.myInvitations();
  }

  Future<void> refresh({bool throwOnError = false}) async {
    try {
      final items = await ref.read(membersRepositoryProvider).myInvitations();
      if (!ref.mounted) return;
      state = AsyncData(items);
    } on Object {
      if (throwOnError) rethrow;
    }
  }

  /// Joins the home and makes it the selected one.
  Future<void> accept(Invitation invitation) async {
    final homes = ref.read(homesProvider.notifier);
    final home = await ref
        .read(membersRepositoryProvider)
        .acceptInvitation(invitation.id);
    homes.addOrReplace(home);
    if (!ref.mounted) return;
    state = AsyncData([
      for (final item in state.value ?? const <Invitation>[])
        if (item.id != invitation.id) item,
    ]);
  }

  Future<void> decline(Invitation invitation) async {
    await ref.read(membersRepositoryProvider).declineInvitation(invitation.id);
    if (!ref.mounted) return;
    state = AsyncData([
      for (final item in state.value ?? const <Invitation>[])
        if (item.id != invitation.id) item,
    ]);
  }
}

final invitationsProvider =
    AsyncNotifierProvider<InvitationsNotifier, List<Invitation>>(
      InvitationsNotifier.new,
    );
