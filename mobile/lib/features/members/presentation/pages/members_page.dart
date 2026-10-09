import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../../core/network/error_messages.dart';
import '../../../../core/theme/app_theme.dart';
import '../../../../core/utils/date_format.dart';
import '../../../../core/widgets/app_feedback.dart';
import '../../../../core/widgets/app_widgets.dart';
import '../../../../core/widgets/async_views.dart';
import '../../../devices/domain/device.dart';
import '../../../homes/domain/home_role.dart';
import '../../../homes/presentation/providers/homes_providers.dart';
import '../../domain/member.dart';
import '../providers/members_providers.dart';
import '../widgets/guest_access_fields.dart';
import 'invite_member_page.dart';

/// Members of a home (FR-6.2 – 6.5). Only the OWNER invites, changes roles
/// and removes; everyone else may leave.
class MembersPage extends ConsumerWidget {
  const MembersPage({super.key, required this.homeId});

  final int homeId;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final role = ref.watch(
      homesProvider.select((h) => h.value?.byId(homeId)?.role),
    );
    final members = ref.watch(membersProvider(homeId));
    final isOwner = role == HomeRole.owner;

    return Scaffold(
      appBar: AppBar(
        title: const Text('Thành viên'),
        actions: [
          if (isOwner)
            IconButton(
              tooltip: 'Mời thành viên',
              icon: const Icon(Icons.person_add_alt),
              onPressed: () => Navigator.of(context).push(
                MaterialPageRoute<void>(
                  builder: (_) => InviteMemberPage(homeId: homeId),
                ),
              ),
            ),
        ],
      ),
      body: AsyncValueView<List<Member>>(
        value: members,
        errorContext: ErrorContext.members,
        onRetry: () => ref.invalidate(membersProvider(homeId)),
        builder: (data) {
          final active = data.where((m) => !m.pending).toList();
          final pending = data.where((m) => m.pending).toList();
          return RefreshIndicator(
            onRefresh: () => ref.read(membersProvider(homeId).notifier).refresh(),
            child: ListView(
              physics: const AlwaysScrollableScrollPhysics(),
              padding: const EdgeInsets.fromLTRB(20, 0, 20, 28),
              children: [
                for (final m in active)
                  _MemberTile(homeId: homeId, member: m, canManage: isOwner),
                if (pending.isNotEmpty) ...[
                  const SizedBox(height: 12),
                  const SectionHeader('Lời mời đang chờ'),
                  for (final m in pending)
                    _MemberTile(homeId: homeId, member: m, canManage: isOwner),
                ],
                if (role != null && role.canLeave) ...[
                  const SizedBox(height: 24),
                  OutlinedButton.icon(
                    onPressed: () => _leave(context, ref),
                    style: OutlinedButton.styleFrom(
                      foregroundColor: AppColors.critical,
                      side: const BorderSide(color: AppColors.critical),
                    ),
                    icon: const Icon(Icons.exit_to_app),
                    label: const Text('Rời khỏi nhà'),
                  ),
                ],
              ],
            ),
          );
        },
      ),
    );
  }

  Future<void> _leave(BuildContext context, WidgetRef ref) async {
    final ok = await confirmDialog(
      context,
      title: 'Rời khỏi nhà?',
      message:
          'Bạn sẽ không còn điều khiển hoặc xem được nhà này. Muốn quay lại, chủ nhà cần mời bạn lần nữa.',
      confirmLabel: 'Rời nhà',
      destructive: true,
    );
    if (!ok || !context.mounted) return;
    final navigator = Navigator.of(context);
    final done = await runAction(
      context,
      () => ref.read(membersProvider(homeId).notifier).leave(),
      errorContext: ErrorContext.members,
      successMessage: 'Bạn đã rời khỏi nhà.',
    );
    if (done) navigator.popUntil((route) => route.isFirst);
  }
}

class _MemberTile extends ConsumerWidget {
  const _MemberTile({
    required this.homeId,
    required this.member,
    required this.canManage,
  });

  final int homeId;
  final Member member;
  final bool canManage;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final notes = <String>[
      ?member.email,
      if (member.pending && member.inviteExpiresAt != null)
        'Lời mời hết hạn ${formatDate(member.inviteExpiresAt!)}',
      if (member.role == HomeRole.guest && member.expiresAt != null)
        'Hết hạn ${formatDateTime(member.expiresAt!)} · ${member.guestDeviceIds.length} thiết bị',
    ];
    final manageable = canManage && member.role != HomeRole.owner;

    return Padding(
      padding: const EdgeInsets.only(bottom: 10),
      child: AppCard(
        radius: 18,
        padding: const EdgeInsets.fromLTRB(14, 12, 6, 12),
        child: Row(
          children: [
            InitialsAvatar(member.initials),
            const SizedBox(width: 12),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    member.isMe ? '${member.name} (Bạn)' : member.name,
                    style: const TextStyle(fontWeight: FontWeight.w600),
                  ),
                  if (notes.isNotEmpty)
                    Text(
                      notes.join('\n'),
                      style: const TextStyle(
                        fontSize: 12,
                        color: AppColors.textSecondary,
                        height: 1.4,
                      ),
                    ),
                  const SizedBox(height: 6),
                  Wrap(
                    spacing: 6,
                    children: [
                      StatusPill(member.role.label),
                      if (member.pending)
                        const StatusPill('Đang chờ', color: AppColors.warning),
                    ],
                  ),
                ],
              ),
            ),
            if (manageable)
              PopupMenuButton<String>(
                tooltip: 'Tuỳ chọn',
                onSelected: (value) => value == 'role'
                    ? _changeRole(context, ref)
                    : _remove(context, ref),
                itemBuilder: (_) => [
                  if (!member.pending)
                    const PopupMenuItem(
                      value: 'role',
                      child: Text('Đổi vai trò'),
                    ),
                  PopupMenuItem(
                    value: 'remove',
                    child: Text(
                      member.pending ? 'Huỷ lời mời' : 'Xoá khỏi nhà',
                    ),
                  ),
                ],
              ),
          ],
        ),
      ),
    );
  }

  Future<void> _remove(BuildContext context, WidgetRef ref) async {
    final ok = await confirmDialog(
      context,
      title: member.pending ? 'Huỷ lời mời?' : 'Xoá thành viên?',
      message: member.pending
          ? 'Lời mời gửi cho ${member.name} sẽ bị huỷ.'
          : '${member.name} sẽ không còn truy cập được nhà này.',
      confirmLabel: member.pending ? 'Huỷ lời mời' : 'Xoá',
      destructive: true,
    );
    if (!ok || !context.mounted) return;
    await runAction(
      context,
      () => ref.read(membersProvider(homeId).notifier).remove(member.id),
      errorContext: ErrorContext.members,
      successMessage: member.pending ? 'Đã huỷ lời mời.' : 'Đã xoá thành viên.',
    );
  }

  Future<void> _changeRole(BuildContext context, WidgetRef ref) async {
    final devices =
        ref.read(homeOverviewProvider(homeId)).value?.devices ?? const [];
    final result = await showModalBottomSheet<_RoleChange>(
      context: context,
      isScrollControlled: true,
      backgroundColor: AppColors.background,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(24)),
      ),
      builder: (_) => _RoleSheet(member: member, devices: devices),
    );
    if (result == null || !context.mounted) return;
    await runAction(
      context,
      () => ref
          .read(membersProvider(homeId).notifier)
          .changeRole(
            member.id,
            role: result.role,
            expiresAt: result.expiresAt,
            deviceIds: result.deviceIds,
          ),
      errorContext: ErrorContext.members,
      successMessage: 'Đã đổi vai trò.',
    );
  }
}

class _RoleChange {
  const _RoleChange(this.role, {this.expiresAt, this.deviceIds});

  final HomeRole role;
  final DateTime? expiresAt;
  final List<int>? deviceIds;
}

class _RoleSheet extends StatefulWidget {
  const _RoleSheet({required this.member, required this.devices});

  final Member member;
  final List<CustomerDevice> devices;

  @override
  State<_RoleSheet> createState() => _RoleSheetState();
}

class _RoleSheetState extends State<_RoleSheet> {
  late HomeRole _role = widget.member.role;
  int _days = 7;
  late Set<int> _selected = {...widget.member.guestDeviceIds};
  String? _error;

  @override
  Widget build(BuildContext context) {
    return SafeArea(
      child: Padding(
        padding: EdgeInsets.fromLTRB(
          20,
          20,
          20,
          20 + MediaQuery.viewInsetsOf(context).bottom,
        ),
        child: SingleChildScrollView(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                'Vai trò của ${widget.member.name}',
                style: const TextStyle(fontSize: 18, fontWeight: FontWeight.bold),
              ),
              const SizedBox(height: 12),
              Wrap(
                spacing: 8,
                runSpacing: 8,
                children: [
                  for (final role in HomeRole.invitable)
                    ChoicePill(
                      label: role.label,
                      selected: _role == role,
                      onTap: () => setState(() => _role = role),
                    ),
                ],
              ),
              const SizedBox(height: 8),
              Text(
                _role.description,
                style: const TextStyle(
                  color: AppColors.textSecondary,
                  fontSize: 13,
                ),
              ),
              if (_role == HomeRole.guest) ...[
                const SizedBox(height: 16),
                GuestAccessFields(
                  devices: widget.devices,
                  days: _days,
                  selected: _selected,
                  onDaysChanged: (d) => setState(() => _days = d),
                  onSelectionChanged: (s) => setState(() {
                    _selected = s;
                    _error = null;
                  }),
                  error: _error,
                ),
              ],
              const SizedBox(height: 16),
              FilledButton(
                onPressed: () {
                  if (_role == HomeRole.guest && _selected.isEmpty) {
                    setState(() => _error = 'Chọn ít nhất một thiết bị');
                    return;
                  }
                  Navigator.of(context).pop(
                    _role == HomeRole.guest
                        ? _RoleChange(
                            _role,
                            expiresAt: DateTime.now().add(Duration(days: _days)),
                            deviceIds: _selected.toList(),
                          )
                        : _RoleChange(_role),
                  );
                },
                child: const Text('LƯU'),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
