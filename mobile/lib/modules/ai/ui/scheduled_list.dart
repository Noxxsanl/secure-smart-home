import 'package:flutter/material.dart';

import '../../../core/theme/app_theme.dart';
import '../domain/assistant_schedule.dart';
import '../domain/schedule_view.dart';
import 'assistant_section.dart';

/// "Đã hẹn": schedules the Assistant created from an explicit time. They can
/// be cancelled until they run. Times are in the home's timezone.
class ScheduledList extends StatelessWidget {
  const ScheduledList({
    super.key,
    required this.schedules,
    required this.now,
    required this.cancellingId,
    required this.onCancel,
  });

  final List<AssistantSchedule> schedules;
  final DateTime now;

  /// Schedule whose cancel request is in flight.
  final int? cancellingId;
  final ValueChanged<AssistantSchedule> onCancel;

  @override
  Widget build(BuildContext context) {
    if (schedules.isEmpty) return const SizedBox.shrink();
    final textTheme = Theme.of(context).textTheme;
    return AssistantSection(
      key: const ValueKey('assistant-scheduled'),
      title: 'Đã hẹn',
      icon: Icons.event_available_outlined,
      child: Padding(
        padding: const EdgeInsets.fromLTRB(12, 4, 12, 8),
        child: Column(
          children: [
            for (final schedule in schedules) _row(textTheme, schedule),
            Align(
              alignment: Alignment.centerLeft,
              child: Text(
                'Xem tất cả lịch ở tab Tự động › Hẹn giờ.',
                style: textTheme.bodySmall?.copyWith(
                  color: AppColors.textSecondary,
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _row(TextTheme textTheme, AssistantSchedule schedule) {
    final when = formatRunAt(schedule.runAt, schedule.timezone, now);
    final Widget trailing;
    if (schedule.status == AssistantScheduleStatus.cancelled) {
      trailing = const _Tag('Đã huỷ', AppColors.textSecondary);
    } else if (schedule.status == AssistantScheduleStatus.done) {
      trailing = const _Tag('Đã chạy', AppColors.success);
    } else if (schedule.isCancellable) {
      trailing = OutlinedButton.icon(
        key: ValueKey('cancel-schedule-${schedule.id}'),
        onPressed: cancellingId != null ? null : () => onCancel(schedule),
        icon: cancellingId == schedule.id
            ? const SizedBox(
                width: 14,
                height: 14,
                child: CircularProgressIndicator(strokeWidth: 2),
              )
            : const Icon(Icons.close, size: 16),
        label: const Text('Huỷ'),
        style: OutlinedButton.styleFrom(
          visualDensity: VisualDensity.compact,
          padding: const EdgeInsets.symmetric(horizontal: 10),
        ),
      );
    } else {
      trailing = const SizedBox.shrink();
    }
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 4),
      child: Row(
        children: [
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  schedule.actionLabel,
                  style: textTheme.bodyMedium?.copyWith(
                    fontWeight: FontWeight.w600,
                  ),
                ),
                Text(
                  schedule.roomName == null
                      ? when
                      : '$when · ${schedule.roomName}',
                  style: textTheme.bodySmall?.copyWith(
                    color: AppColors.textSecondary,
                  ),
                ),
              ],
            ),
          ),
          trailing,
        ],
      ),
    );
  }
}

class _Tag extends StatelessWidget {
  const _Tag(this.label, this.color);

  final String label;
  final Color color;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
      decoration: BoxDecoration(
        color: color.withValues(alpha: 0.12),
        borderRadius: BorderRadius.circular(6),
      ),
      child: Text(
        label,
        style: Theme.of(context).textTheme.labelSmall?.copyWith(
          color: color,
          fontWeight: FontWeight.w700,
        ),
      ),
    );
  }
}
