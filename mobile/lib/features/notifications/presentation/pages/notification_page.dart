import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../../core/network/error_messages.dart';
import '../../../../core/theme/app_theme.dart';
import '../../../../core/utils/date_format.dart';
import '../../../../core/widgets/app_feedback.dart';
import '../../../../core/widgets/app_widgets.dart';
import '../../../../core/widgets/async_views.dart';
import '../../../homes/presentation/providers/homes_providers.dart';
import '../../domain/app_notification.dart';
import '../providers/notification_providers.dart';

Color severityColor(Severity severity) => switch (severity) {
  Severity.critical => AppColors.critical,
  Severity.warning => AppColors.warning,
  Severity.info => AppColors.info,
  Severity.success => AppColors.success,
};

IconData severityIcon(Severity severity) => switch (severity) {
  Severity.critical => Icons.error_outline,
  Severity.warning => Icons.warning_amber_rounded,
  Severity.info => Icons.info_outline,
  Severity.success => Icons.check_circle_outline,
};

/// Notification centre (FR-8.2): current home or all homes, mark read /
/// mark all read, colour by severity.
class NotificationPage extends ConsumerStatefulWidget {
  const NotificationPage({super.key});

  @override
  ConsumerState<NotificationPage> createState() => _NotificationPageState();
}

class _NotificationPageState extends ConsumerState<NotificationPage> {
  bool _allHomes = false;

  Future<void> _refresh() async {
    final messenger = ScaffoldMessenger.maybeOf(context);
    try {
      await ref
          .read(notificationsProvider.notifier)
          .refresh(throwOnError: true);
    } on Object catch (error) {
      showAppSnack(messenger, userMessageFor(error), error: true);
    }
  }

  @override
  Widget build(BuildContext context) {
    final state = ref.watch(notificationsProvider);
    final current = ref.watch(currentHomeProvider);
    final homeCount = ref.watch(
      homesProvider.select((homes) => homes.value?.homes.length ?? 0),
    );

    return Scaffold(
      appBar: AppBar(
        automaticallyImplyLeading: false,
        title: const Text('Thông báo'),
        actions: [
          IconButton(
            tooltip: 'Đánh dấu tất cả đã đọc',
            icon: const Icon(Icons.done_all),
            onPressed: () => runAction(
              context,
              () => ref
                  .read(notificationsProvider.notifier)
                  .markAllRead(homeId: _allHomes ? null : current?.id),
            ),
          ),
        ],
      ),
      body: AsyncValueView<NotificationsState>(
        value: state,
        onRetry: () => ref.invalidate(notificationsProvider),
        builder: (data) {
          final items = _allHomes || current == null
              ? data.items
              : data.items
                    .where((n) => n.homeId == null || n.homeId == current.id)
                    .toList();
          return Column(
            children: [
              if (homeCount > 1)
                Padding(
                  padding: const EdgeInsets.fromLTRB(20, 0, 20, 12),
                  child: Row(
                    children: [
                      ChoicePill(
                        label: 'Nhà hiện tại',
                        selected: !_allHomes,
                        onTap: () => setState(() => _allHomes = false),
                      ),
                      const SizedBox(width: 8),
                      ChoicePill(
                        label: 'Tất cả nhà',
                        selected: _allHomes,
                        onTap: () => setState(() => _allHomes = true),
                      ),
                    ],
                  ),
                ),
              Expanded(
                child: RefreshIndicator(
                  onRefresh: _refresh,
                  child: items.isEmpty
                      ? ListView(
                          physics: const AlwaysScrollableScrollPhysics(),
                          children: const [
                            SizedBox(height: 100),
                            EmptyState(
                              icon: Icons.notifications_none,
                              title: 'Bạn chưa có thông báo mới',
                              message:
                                  'Cảnh báo thiết bị, cửa mở và hoạt động của nhà sẽ hiện ở đây.',
                            ),
                          ],
                        )
                      : ListView.separated(
                          physics: const AlwaysScrollableScrollPhysics(),
                          padding: const EdgeInsets.fromLTRB(20, 0, 20, 20),
                          itemCount: items.length,
                          separatorBuilder: (_, _) => const SizedBox(height: 10),
                          itemBuilder: (context, index) => _NotificationTile(
                            notification: items[index],
                            showHome: _allHomes,
                            onTap: () => runAction(
                              context,
                              () => ref
                                  .read(notificationsProvider.notifier)
                                  .markRead(items[index].id),
                            ),
                          ),
                        ),
                ),
              ),
            ],
          );
        },
      ),
    );
  }
}

class _NotificationTile extends StatelessWidget {
  const _NotificationTile({
    required this.notification,
    required this.showHome,
    required this.onTap,
  });

  final AppNotification notification;
  final bool showHome;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final color = severityColor(notification.severity);
    final unread = !notification.isRead;
    return AppCard(
      onTap: onTap,
      radius: 20,
      padding: const EdgeInsets.all(14),
      color: unread ? AppColors.surface : AppColors.surface.withValues(alpha: 0.7),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          IconBadge(icon: severityIcon(notification.severity), color: color),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  children: [
                    Expanded(
                      child: Text(
                        notification.title,
                        style: TextStyle(
                          fontWeight: unread ? FontWeight.bold : FontWeight.w600,
                          color: AppColors.textPrimary,
                        ),
                      ),
                    ),
                    if (unread)
                      Container(
                        width: 9,
                        height: 9,
                        decoration: BoxDecoration(
                          color: color,
                          shape: BoxShape.circle,
                        ),
                      ),
                  ],
                ),
                const SizedBox(height: 3),
                Text(
                  notification.message,
                  style: const TextStyle(
                    color: AppColors.textSecondary,
                    height: 1.35,
                    fontSize: 13,
                  ),
                ),
                const SizedBox(height: 8),
                Row(
                  children: [
                    if (showHome && notification.homeName != null) ...[
                      StatusPill(notification.homeName!, color: AppColors.primary),
                      const SizedBox(width: 8),
                    ],
                    Text(
                      formatRelative(notification.createdAt),
                      style: const TextStyle(
                        fontSize: 11,
                        color: AppColors.textSecondary,
                      ),
                    ),
                  ],
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}
