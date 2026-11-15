import 'package:flutter/material.dart';

import '../../../core/theme/app_theme.dart';
import '../domain/assistant_schedule.dart';
import '../domain/schedule_view.dart';

/// Outcome of each step the Assistant ran (right away, or after a
/// confirmation): icon, label, room and the reason when it did not work.
class StepResults extends StatelessWidget {
  const StepResults({
    super.key,
    required this.results,
    required this.now,
    this.emptyText,
  });

  final List<AssistantSchedule> results;
  final DateTime now;

  /// Shown when there is no step.
  final String? emptyText;

  @override
  Widget build(BuildContext context) {
    final textTheme = Theme.of(context).textTheme;
    return Padding(
      padding: const EdgeInsets.fromLTRB(12, 8, 12, 10),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          if (results.isEmpty && emptyText != null)
            Text(
              emptyText!,
              style: textTheme.bodySmall?.copyWith(
                color: AppColors.textSecondary,
              ),
            ),
          for (final schedule in results) _row(textTheme, schedule),
        ],
      ),
    );
  }

  Widget _row(TextTheme textTheme, AssistantSchedule schedule) {
    final tone = schedule.status.tone;
    final color = switch (tone) {
      AssistantResultTone.ok => AppColors.success,
      AssistantResultTone.bad => AppColors.critical,
      AssistantResultTone.neutral => AppColors.textSecondary,
    };
    final icon = switch (tone) {
      AssistantResultTone.ok => Icons.check_circle_outline,
      AssistantResultTone.bad => Icons.warning_amber_rounded,
      AssistantResultTone.neutral => Icons.remove_circle_outline,
    };
    final reason = resultReason(schedule);
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 4),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Icon(icon, size: 18, color: color),
          const SizedBox(width: 8),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text.rich(
                  TextSpan(
                    children: [
                      TextSpan(
                        text: schedule.actionLabel,
                        style: const TextStyle(fontWeight: FontWeight.w600),
                      ),
                      if (schedule.roomName != null)
                        TextSpan(
                          text: ' · ${schedule.roomName}',
                          style: const TextStyle(
                            color: AppColors.textSecondary,
                          ),
                        ),
                    ],
                  ),
                  style: textTheme.bodyMedium,
                ),
                Text(
                  resultLabel(schedule, now),
                  style: textTheme.bodySmall?.copyWith(color: color),
                ),
                if (reason != null)
                  Text(
                    reason,
                    style: textTheme.bodySmall?.copyWith(
                      color: AppColors.textSecondary,
                    ),
                  ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}
