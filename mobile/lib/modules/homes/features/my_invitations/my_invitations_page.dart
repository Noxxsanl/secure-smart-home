import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../../core/network/error_messages.dart';
import '../../../../core/theme/app_theme.dart';
import '../../../../core/utils/date_format.dart';
import '../../../../core/widgets/app_feedback.dart';
import '../../../../core/widgets/app_widgets.dart';
import '../../../../core/widgets/async_views.dart';
import '../../application/members_providers.dart';
import '../../domain/member.dart';

/// "Lời mời của tôi" (FR-6.6): accept or decline invitations.
class MyInvitationsPage extends ConsumerWidget {
  const MyInvitationsPage({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final invitations = ref.watch(invitationsProvider);
    return Scaffold(
      appBar: AppBar(title: const Text('Lời mời của tôi')),
      body: AsyncValueView<List<Invitation>>(
        value: invitations,
        errorContext: ErrorContext.invitation,
        onRetry: () => ref.invalidate(invitationsProvider),
        builder: (items) => RefreshIndicator(
          onRefresh: () =>
              ref.read(invitationsProvider.notifier).refresh(),
          child: items.isEmpty
              ? ListView(
                  physics: const AlwaysScrollableScrollPhysics(),
                  children: const [
                    SizedBox(height: 100),
                    EmptyState(
                      icon: Icons.mail_outline,
                      title: 'Chưa có lời mời nào',
                      message:
                          'Khi chủ nhà mời bạn bằng email của tài khoản này, lời mời sẽ hiện ở đây.',
                    ),
                  ],
                )
              : ListView.separated(
                  physics: const AlwaysScrollableScrollPhysics(),
                  padding: const EdgeInsets.fromLTRB(20, 0, 20, 24),
                  itemCount: items.length,
                  separatorBuilder: (_, _) => const SizedBox(height: 12),
                  itemBuilder: (context, index) =>
                      _InvitationCard(invitation: items[index]),
                ),
        ),
      ),
    );
  }
}

class _InvitationCard extends ConsumerStatefulWidget {
  const _InvitationCard({required this.invitation});

  final Invitation invitation;

  @override
  ConsumerState<_InvitationCard> createState() => _InvitationCardState();
}

class _InvitationCardState extends ConsumerState<_InvitationCard> {
  bool _busy = false;

  Future<void> _respond(bool accept) async {
    final invitation = widget.invitation;
    final notifier = ref.read(invitationsProvider.notifier);
    setState(() => _busy = true);
    final ok = await runAction(
      context,
      () => accept ? notifier.accept(invitation) : notifier.decline(invitation),
      errorContext: ErrorContext.invitation,
      successMessage: accept
          ? 'Bạn đã tham gia ${invitation.homeName}.'
          : 'Đã từ chối lời mời.',
    );
    if (!ok && mounted) setState(() => _busy = false);
  }

  @override
  Widget build(BuildContext context) {
    final i = widget.invitation;
    return AppCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              const IconBadge(icon: Icons.home_outlined),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      i.homeName,
                      style: const TextStyle(
                        fontWeight: FontWeight.bold,
                        fontSize: 16,
                      ),
                    ),
                    if (i.homeAddress != null)
                      Text(
                        i.homeAddress!,
                        style: const TextStyle(
                          fontSize: 12,
                          color: AppColors.textSecondary,
                        ),
                      ),
                  ],
                ),
              ),
              StatusPill(i.role.label),
            ],
          ),
          const SizedBox(height: 10),
          Text(
            [
              if (i.invitedByName != null) 'Mời bởi ${i.invitedByName}',
              if (i.expiresAt != null)
                'Quyền khách hết hạn ${formatDateTime(i.expiresAt!)}',
              if (i.inviteExpiresAt != null)
                'Lời mời hết hạn ${formatDate(i.inviteExpiresAt!)}',
            ].join('\n'),
            style: const TextStyle(
              color: AppColors.textSecondary,
              fontSize: 12,
              height: 1.5,
            ),
          ),
          const SizedBox(height: 14),
          Row(
            children: [
              Expanded(
                child: OutlinedButton(
                  onPressed: _busy ? null : () => _respond(false),
                  child: const Text('Từ chối'),
                ),
              ),
              const SizedBox(width: 10),
              Expanded(
                child: FilledButton(
                  key: ValueKey<String>('accept-invitation-${i.id}'),
                  style: FilledButton.styleFrom(
                    padding: const EdgeInsets.symmetric(vertical: 14),
                  ),
                  onPressed: _busy ? null : () => _respond(true),
                  child: const Text('Chấp nhận'),
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }
}
