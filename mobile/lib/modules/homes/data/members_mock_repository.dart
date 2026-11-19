import '../../../core/network/api_exception.dart';
import '../../../mock/mock_backend.dart';
import '../../notifications/notifications.dart';
import '../domain/home.dart';
import '../domain/home_role.dart';
import '../domain/member.dart';
import '../domain/members_repository.dart';

/// Members + invitations with the same rules as the backend (contract §4.2):
/// only the OWNER manages members, GUEST needs a ≤30-day expiry and devices,
/// the OWNER cannot leave, emails are private to the OWNER.
class MockMembersRepository implements MembersRepository {
  MockMembersRepository(this._backend);

  final MockBackend _backend;

  static final _emailPattern = RegExp(r'^[^@\s]+@[^@\s]+\.[^@\s]+$');

  MockMembership _requireOwner(int homeId) {
    final membership = _backend.requireMembership(homeId);
    if (membership.role != HomeRole.owner) _backend.forbidden();
    return membership;
  }

  MockMembership _target(int memberId) {
    for (final m in _backend.memberships) {
      if (m.id == memberId) return m;
    }
    _backend.notFound();
  }

  Member _toMember(MockMembership m, {required bool viewerIsOwner}) {
    final account = _backend.accountById(m.userId);
    final name = account?.fullName ?? m.displayName;
    final parts = name
        .trim()
        .split(RegExp(r'\s+'))
        .where((part) => part.isNotEmpty)
        .toList();
    final initials = parts.isEmpty
        ? '?'
        : (parts.length == 1
              ? parts.first[0].toUpperCase()
              : '${parts.first[0]}${parts.last[0]}'.toUpperCase());
    return Member(
      id: m.id,
      homeId: m.homeId,
      userId: m.userId,
      name: name,
      initials: initials,
      email: viewerIsOwner ? (account?.email ?? m.inviteEmail) : null,
      role: m.role,
      isMe: m.userId != null && m.userId == _backend.currentUserId,
      pending: m.isPending,
      inviteExpiresAt: m.isPending ? m.inviteExpiresAt : null,
      expiresAt: m.expiresAt,
      guestDeviceIds: m.guestDeviceIds.toList()..sort(),
      joinedAt: m.acceptedAt,
    );
  }

  /// FR-6.3: GUEST access needs an expiry within 30 days and ≥1 device.
  void _validateGuest(int homeId, DateTime? expiresAt, Set<int> deviceIds) {
    final stamp = _backend.now;
    if (expiresAt == null ||
        !expiresAt.isAfter(stamp) ||
        expiresAt.isAfter(stamp.add(const Duration(days: maxGuestAccessDays)))) {
      _backend.invalidInput();
    }
    final homeDevices = {
      for (final d in _backend.devices)
        if (d.homeId == homeId && !d.category.apiValue.contains('gateway'))
          d.id,
    };
    if (deviceIds.isEmpty || !deviceIds.every(homeDevices.contains)) {
      _backend.invalidInput();
    }
  }

  @override
  Future<List<Member>> list(int homeId) {
    return _backend.respond(() {
      final viewer = _backend.requireMembership(homeId);
      final isOwner = viewer.role == HomeRole.owner;
      final rows = _backend.memberships.where((m) {
        if (m.homeId != homeId) return false;
        if (m.isPending) {
          return isOwner &&
              (m.inviteExpiresAt?.isAfter(_backend.now) ?? false);
        }
        return m.userId != null &&
            (m.expiresAt == null || m.expiresAt!.isAfter(_backend.now));
      }).toList()
        ..sort((a, b) {
          int rank(MockMembership m) => m.isPending
              ? 3
              : (m.role == HomeRole.owner ? 0 : (m.role == HomeRole.guest ? 2 : 1));
          final byRank = rank(a).compareTo(rank(b));
          return byRank != 0 ? byRank : a.createdAt.compareTo(b.createdAt);
        });
      return [for (final m in rows) _toMember(m, viewerIsOwner: isOwner)];
    });
  }

  @override
  Future<Member> invite(int homeId, InviteInput input) {
    return _backend.respond(() {
      _requireOwner(homeId);
      final email = input.email.trim().toLowerCase();
      final name = input.name.trim();
      if (!_emailPattern.hasMatch(email) ||
          email.length > 190 ||
          name.isEmpty ||
          name.length > 128 ||
          !HomeRole.invitable.contains(input.role)) {
        _backend.invalidInput();
      }
      if (email == _backend.me.email) {
        throw const ApiException(
          code: ApiErrorCode.cannotInviteSelf,
          statusCode: 400,
        );
      }
      final alreadyThere = _backend.memberships.any((m) {
        if (m.homeId != homeId) return false;
        if (m.isPending) return m.inviteEmail == email;
        return m.userId != null &&
            _backend.accountById(m.userId)?.email == email;
      });
      if (alreadyThere) {
        throw const ApiException(
          code: ApiErrorCode.alreadyMember,
          statusCode: 409,
        );
      }
      final deviceIds = {...?input.deviceIds};
      if (input.role == HomeRole.guest) {
        _validateGuest(homeId, input.expiresAt, deviceIds);
      }
      final stamp = _backend.now;
      final membership = MockMembership(
        id: _backend.nextId('member'),
        homeId: homeId,
        role: input.role,
        displayName: name,
        createdAt: stamp,
        inviteEmail: email,
        inviteExpiresAt: stamp.add(const Duration(days: 7)),
        invitedBy: _backend.meId,
        expiresAt: input.role == HomeRole.guest ? input.expiresAt : null,
        guestDeviceIds: input.role == HomeRole.guest ? deviceIds : null,
      );
      _backend.memberships.add(membership);

      final invitee = _backend.accountByEmail(email);
      if (invitee != null) {
        _backend.addNotification(
          userId: invitee.id,
          homeId: null,
          type: 'MEMBER_INVITED',
          title: 'Bạn được mời vào nhà',
          message:
              '${_backend.me.fullName} mời bạn vào ${_backend.homeRecord(homeId).home.name}. Mở "Lời mời của tôi" để trả lời.',
          severity: Severity.info,
        );
      }
      return _toMember(membership, viewerIsOwner: true);
    });
  }

  @override
  Future<Member> update(
    int memberId, {
    HomeRole? role,
    DateTime? expiresAt,
    List<int>? deviceIds,
  }) {
    return _backend.respond(() {
      final target = _target(memberId);
      _requireOwner(target.homeId);
      if (target.role == HomeRole.owner) _backend.forbidden();
      final nextRole = role ?? target.role;
      if (!HomeRole.invitable.contains(nextRole)) _backend.invalidInput();
      if (nextRole == HomeRole.guest) {
        final nextExpiry = expiresAt ?? target.expiresAt;
        final nextDevices = deviceIds == null
            ? target.guestDeviceIds
            : deviceIds.toSet();
        _validateGuest(target.homeId, nextExpiry, nextDevices);
        target
          ..expiresAt = nextExpiry
          ..guestDeviceIds = {...nextDevices};
      } else {
        target
          ..expiresAt = null
          ..guestDeviceIds = <int>{};
      }
      target.role = nextRole;
      _backend.emitHomeChanged(target.homeId);
      return _toMember(target, viewerIsOwner: true);
    });
  }

  @override
  Future<void> remove(int memberId) {
    return _backend.respond(() {
      final target = _target(memberId);
      _requireOwner(target.homeId);
      if (target.role == HomeRole.owner) _backend.forbidden();
      _backend.memberships.remove(target);
      _backend.emitHomeChanged(target.homeId);
    });
  }

  @override
  Future<void> leave(int homeId) {
    return _backend.respond(() {
      final membership = _backend.requireMembership(homeId);
      if (membership.role == HomeRole.owner) {
        throw const ApiException(
          code: ApiErrorCode.ownerCannotLeave,
          statusCode: 403,
        );
      }
      _backend.memberships.remove(membership);
      _backend.emitHomeChanged(homeId);
    });
  }

  Iterable<MockMembership> _myPendingInvites() {
    final email = _backend.me.email;
    return _backend.memberships.where(
      (m) =>
          m.isPending &&
          m.inviteEmail == email &&
          (m.inviteExpiresAt?.isAfter(_backend.now) ?? false) &&
          (m.expiresAt == null || m.expiresAt!.isAfter(_backend.now)),
    );
  }

  @override
  Future<List<Invitation>> myInvitations() {
    return _backend.respond(() {
      return [
        for (final m in _myPendingInvites())
          Invitation(
            id: m.id,
            homeId: m.homeId,
            homeName: _backend.homeRecord(m.homeId).home.name,
            homeAddress: _backend.homeRecord(m.homeId).home.address,
            role: m.role,
            invitedByName: _backend.accountById(m.invitedBy)?.fullName,
            inviteExpiresAt: m.inviteExpiresAt,
            expiresAt: m.expiresAt,
          ),
      ];
    });
  }

  @override
  Future<MyHome> acceptInvitation(int invitationId) {
    return _backend.respond(() {
      final matches = _myPendingInvites().where((m) => m.id == invitationId);
      if (matches.isEmpty) _backend.notFound();
      final invite = matches.first;
      if (_backend.membershipFor(_backend.meId, invite.homeId) != null) {
        throw const ApiException(
          code: ApiErrorCode.alreadyMember,
          statusCode: 409,
        );
      }
      invite
        ..userId = _backend.meId
        ..inviteEmail = null
        ..inviteExpiresAt = null
        ..displayName = _backend.me.fullName
        ..acceptedAt = _backend.now;
      for (final ownerId in _backend.memberIds(invite.homeId)) {
        final owner = _backend.membershipFor(ownerId, invite.homeId);
        if (owner?.role != HomeRole.owner) continue;
        _backend.addNotification(
          userId: ownerId,
          homeId: invite.homeId,
          type: 'MEMBER_JOINED',
          title: 'Thành viên mới',
          message: '${_backend.me.fullName} đã tham gia nhà với vai trò ${invite.role.label}.',
          severity: Severity.info,
        );
      }
      _backend.emitHomeChanged(invite.homeId);
      return _backend.myHomes().firstWhere((h) => h.id == invite.homeId);
    });
  }

  @override
  Future<void> declineInvitation(int invitationId) {
    return _backend.respond(() {
      final matches = _myPendingInvites().where((m) => m.id == invitationId);
      if (matches.isEmpty) _backend.notFound();
      _backend.memberships.remove(matches.first);
    });
  }
}
