import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../../core/theme/app_theme.dart';
import '../../../../core/widgets/app_feedback.dart';
import '../../../../core/widgets/app_widgets.dart';
import '../../../../core/widgets/async_views.dart';
import '../../../homes/homes.dart';
import '../../application/schedule_providers.dart';
import '../../domain/schedule.dart';
import '../../domain/schedule_input.dart';
import '../../domain/schedule_text.dart';
import '../../ui/create_schedule_sheet.dart';
import '../../ui/schedule_tile.dart';

/// "Hẹn giờ" tab of Tự động (FR-5.10): upcoming / history lists of the
/// current home's one-off schedules and "Thêm hẹn giờ". No app bar or
/// floating button of its own — the parent page provides the frame.
class SchedulesView extends ConsumerStatefulWidget {
  const SchedulesView({super.key});

  @override
  ConsumerState<SchedulesView> createState() => _SchedulesViewState();
}

class _SchedulesViewState extends ConsumerState<SchedulesView> {
  ScheduleScope _scope = ScheduleScope.upcoming;

  Future<void> _refresh(int homeId) async {
    ref.read(scheduleActionsProvider).refresh(homeId);
    try {
      await ref.read(schedulesProvider((homeId: homeId, scope: _scope)).future);
    } on Object {
      // The list shows its own error state.
    }
  }

  Future<void> _add(MyHome home, HomeOverview overview) async {
    final messenger = ScaffoldMessenger.maybeOf(context);
    final created = await showCreateScheduleSheet(
      context,
      homeId: home.id,
      timezone: overview.home.timezone,
      devices: schedulableDevices(overview.devices),
    );
    if (!created) return;
    showAppSnack(messenger, 'Đã tạo hẹn giờ.');
    if (mounted) setState(() => _scope = ScheduleScope.upcoming);
  }

  @override
  Widget build(BuildContext context) {
    final home = ref.watch(currentHomeProvider);
    if (home == null) return const LoadingView();
    final overview = ref.watch(homeOverviewProvider(home.id)).value;
    final canCreate = home.role != HomeRole.viewer;
    final suspended = overview?.home.isSuspended ?? home.home.isSuspended;
    final list = ref.watch(schedulesProvider((homeId: home.id, scope: _scope)));
    final now = DateTime.now();

    return RefreshIndicator(
      onRefresh: () => _refresh(home.id),
      child: ListView(
        physics: const AlwaysScrollableScrollPhysics(),
        padding: const EdgeInsets.fromLTRB(20, 8, 20, 32),
        children: [
          Text(
            scheduleIntro(canCreate: canCreate),
            style: const TextStyle(
              color: AppColors.textSecondary,
              fontSize: 13,
              height: 1.4,
            ),
          ),
          const SizedBox(height: 12),
          if (home.role == HomeRole.guest) ...[
            const InlineBanner(
              message:
                  'Bạn là khách nên chỉ thấy các hẹn giờ do chính bạn tạo.',
            ),
            const SizedBox(height: 12),
          ],
          if (suspended) ...[
            const InlineBanner(
              kind: BannerKind.warning,
              message:
                  'Dịch vụ của nhà này đang tạm ngưng nên chưa tạo được hẹn '
                  'giờ mới. Bạn vẫn huỷ được các lịch đang chờ.',
            ),
            const SizedBox(height: 12),
          ],
          if (canCreate) ...[
            FilledButton.icon(
              key: const ValueKey<String>('schedule-add'),
              onPressed: suspended || overview == null
                  ? null
                  : () => _add(home, overview),
              icon: const Icon(Icons.add),
              label: const Text('Thêm hẹn giờ'),
            ),
            const SizedBox(height: 16),
          ],
          Row(
            children: [
              ChoicePill(
                key: const ValueKey<String>('schedule-scope-upcoming'),
                label: 'Sắp chạy',
                selected: _scope == ScheduleScope.upcoming,
                onTap: () => setState(() => _scope = ScheduleScope.upcoming),
              ),
              const SizedBox(width: 8),
              ChoicePill(
                key: const ValueKey<String>('schedule-scope-history'),
                label: 'Lịch sử',
                selected: _scope == ScheduleScope.history,
                onTap: () => setState(() => _scope = ScheduleScope.history),
              ),
            ],
          ),
          const SizedBox(height: 16),
          AsyncValueView<List<Schedule>>(
            value: list,
            onRetry: () => ref.read(scheduleActionsProvider).refresh(home.id),
            builder: (items) {
              if (items.isEmpty) {
                return _scope == ScheduleScope.upcoming
                    ? EmptyState(
                        icon: Icons.alarm_off_outlined,
                        title: 'Chưa có hẹn giờ nào đang chờ',
                        message: canCreate
                            ? 'Bấm “Thêm hẹn giờ” để đặt giờ bật/tắt thiết bị '
                                  'một lần.'
                            : null,
                      )
                    : const EmptyState(
                        icon: Icons.history,
                        title: 'Chưa có hẹn giờ nào đã chạy',
                        message:
                            'Các hẹn giờ đã chạy, bị bỏ qua hoặc đã huỷ sẽ '
                            'hiện ở đây.',
                      );
              }
              return Column(
                children: [
                  for (final schedule in items)
                    Padding(
                      padding: const EdgeInsets.only(bottom: 12),
                      child: ScheduleTile(
                        schedule: schedule,
                        now: now,
                        history: _scope == ScheduleScope.history,
                        onCancel: () =>
                            cancelScheduleWithConfirm(context, ref, schedule),
                      ),
                    ),
                ],
              );
            },
          ),
        ],
      ),
    );
  }
}
