import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/network/error_messages.dart';
import '../../../core/theme/app_theme.dart';
import '../../../core/widgets/app_feedback.dart';
import '../../../core/widgets/app_widgets.dart';
import '../../devices/devices.dart' show ApplianceKind;
import '../application/schedule_providers.dart';
import '../domain/schedule.dart';
import '../domain/schedule_text.dart';

/// Icon by what the schedule drives.
IconData scheduleIcon(Schedule schedule) => switch (schedule.appliance) {
  ApplianceKind.lamp => Icons.lightbulb_outline,
  ApplianceKind.fan => Icons.air,
  ApplianceKind.curtain => Icons.curtains_outlined,
  ApplianceKind.airConditioner => Icons.ac_unit,
  _ => Icons.alarm,
};

Color _statusColor(ScheduleStatus status) => switch (status) {
  ScheduleStatus.scheduled || ScheduleStatus.running => AppColors.primary,
  ScheduleStatus.done => AppColors.success,
  ScheduleStatus.failed => AppColors.critical,
  ScheduleStatus.missed => AppColors.warning,
  ScheduleStatus.skipped ||
  ScheduleStatus.cancelled ||
  ScheduleStatus.unknown => AppColors.offline,
};

/// One schedule row: what it does, when (home time + countdown), who made it,
/// and a cancel button while it can still be cancelled.
///
/// [history] shows the status chip and the reason instead of the countdown;
/// [embedded] drops the card (rows inside the device detail section) and the
/// device name (it is already the page's subject).
class ScheduleTile extends StatelessWidget {
  const ScheduleTile({
    super.key,
    required this.schedule,
    required this.now,
    this.history = false,
    this.embedded = false,
    this.onCancel,
  });

  final Schedule schedule;

  /// The clock the countdown and "hôm nay/ngày mai" are read against.
  final DateTime now;
  final bool history;
  final bool embedded;
  final VoidCallback? onCancel;

  @override
  Widget build(BuildContext context) {
    final reason = history ? scheduleReason(schedule) : null;
    final place = [
      if (!embedded && schedule.deviceName != null) schedule.deviceName!,
      if (!embedded && schedule.roomName != null) schedule.roomName!,
    ].join(' · ');
    final creator = schedule.createdByName == null
        ? null
        : 'Tạo bởi ${schedule.createdByName}';
    final when = history
        ? scheduleRunAtText(schedule, now)
        : scheduleWhenWithCountdown(schedule, now);

    final row = Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        IconBadge(
          icon: scheduleIcon(schedule),
          color: history ? AppColors.offline : AppColors.primary,
        ),
        const SizedBox(width: 12),
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Wrap(
                spacing: 8,
                runSpacing: 4,
                crossAxisAlignment: WrapCrossAlignment.center,
                children: [
                  Text(
                    schedule.actionLabel,
                    style: const TextStyle(
                      fontWeight: FontWeight.bold,
                      color: AppColors.textPrimary,
                    ),
                  ),
                  if (schedule.isAiAgent)
                    const StatusPill('Trợ lý', icon: Icons.auto_awesome),
                  if (history)
                    StatusPill(
                      schedule.status.label,
                      color: _statusColor(schedule.status),
                    ),
                ],
              ),
              if (place.isNotEmpty) _line(place),
              _line(when, strong: true),
              if (creator != null) _line(creator, small: true),
              if (reason != null) _line(reason),
            ],
          ),
        ),
        if (schedule.canCancel && onCancel != null) ...[
          const SizedBox(width: 8),
          TextButton(
            key: ValueKey<String>('schedule-cancel-${schedule.id}'),
            onPressed: onCancel,
            style: TextButton.styleFrom(
              foregroundColor: AppColors.critical,
              visualDensity: VisualDensity.compact,
            ),
            child: const Text('Huỷ'),
          ),
        ],
      ],
    );

    return KeyedSubtree(
      key: ValueKey<String>('schedule-tile-${schedule.id}'),
      child: embedded
          ? Padding(
              padding: const EdgeInsets.symmetric(vertical: 10),
              child: row,
            )
          : AppCard(padding: const EdgeInsets.all(14), child: row),
    );
  }

  Widget _line(String text, {bool strong = false, bool small = false}) {
    return Padding(
      padding: const EdgeInsets.only(top: 3),
      child: Text(
        text,
        style: TextStyle(
          fontSize: small ? 11 : 13,
          height: 1.3,
          color: strong ? AppColors.textPrimary : AppColors.textSecondary,
        ),
      ),
    );
  }
}

/// Asks to confirm, cancels the schedule and reports the result in a snackbar
/// (Vietnamese guidance on failure). The lists refresh either way.
Future<void> cancelScheduleWithConfirm(
  BuildContext context,
  WidgetRef ref,
  Schedule schedule,
) async {
  final messenger = ScaffoldMessenger.maybeOf(context);
  final actions = ref.read(scheduleActionsProvider);
  final when = scheduleRunAtText(schedule, DateTime.now());
  final confirmed = await confirmDialog(
    context,
    title: 'Huỷ hẹn giờ',
    message:
        'Huỷ “${schedule.actionLabel}” lúc $when? Thiết bị sẽ không được điều '
        'khiển vào giờ đó.',
    confirmLabel: 'Huỷ hẹn giờ',
    cancelLabel: 'Giữ lại',
    destructive: true,
  );
  if (!confirmed) return;
  try {
    await actions.cancel(schedule.homeId, schedule.id);
    showAppSnack(messenger, 'Đã huỷ hẹn giờ.');
  } on Object catch (error) {
    showAppSnack(
      messenger,
      userMessageFor(error, overrides: scheduleErrors),
      error: true,
    );
  }
}
