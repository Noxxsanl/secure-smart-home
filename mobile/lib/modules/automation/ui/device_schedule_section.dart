import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/network/error_messages.dart';
import '../../../core/theme/app_theme.dart';
import '../../../core/widgets/app_feedback.dart';
import '../../../core/widgets/app_widgets.dart';
import '../../devices/devices.dart' show CustomerDevice;
import '../../homes/homes.dart';
import '../application/schedule_providers.dart';
import '../domain/schedule.dart';
import 'create_schedule_sheet.dart';
import 'schedule_tile.dart';

/// "Hẹn giờ" block of the device detail: the upcoming schedules of this device
/// plus "Thêm hẹn giờ" (the sheet opens with the device preselected). Renders
/// nothing for a device that cannot be scheduled.
class DeviceScheduleSection extends ConsumerWidget {
  const DeviceScheduleSection({
    super.key,
    required this.homeId,
    required this.device,
  });

  final int homeId;
  final CustomerDevice device;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    if (!device.isSchedulable) return const SizedBox.shrink();

    final overview = ref.watch(homeOverviewProvider(homeId)).value;
    final suspended = overview?.home.isSuspended ?? false;
    final upcoming = ref.watch(
      schedulesProvider((homeId: homeId, scope: ScheduleScope.upcoming)),
    );
    final now = DateTime.now();

    Widget body;
    final items = upcoming.value
        ?.where((s) => s.deviceId == device.id)
        .toList(growable: false);
    if (items == null) {
      body = upcoming.hasError
          ? Row(
              children: [
                Expanded(
                  child: Text(
                    userMessageFor(upcoming.error!),
                    style: const TextStyle(color: AppColors.textSecondary),
                  ),
                ),
                TextButton(
                  onPressed: () =>
                      ref.read(scheduleActionsProvider).refresh(homeId),
                  child: const Text('Thử lại'),
                ),
              ],
            )
          : const Padding(
              padding: EdgeInsets.symmetric(vertical: 12),
              child: LinearProgressIndicator(),
            );
    } else if (items.isEmpty) {
      body = const Text(
        'Chưa có hẹn giờ nào cho thiết bị này. Bấm “Thêm hẹn giờ” để đặt giờ '
        'bật/tắt một lần.',
        style: TextStyle(color: AppColors.textSecondary, height: 1.4),
      );
    } else {
      body = Column(
        children: [
          for (final schedule in items)
            ScheduleTile(
              schedule: schedule,
              now: now,
              embedded: true,
              onCancel: () => cancelScheduleWithConfirm(context, ref, schedule),
            ),
        ],
      );
    }

    return AppCard(
      key: const ValueKey<String>('device-schedule-section'),
      padding: const EdgeInsets.all(16),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              const Icon(Icons.alarm, color: AppColors.primary, size: 20),
              const SizedBox(width: 8),
              const Expanded(
                child: Text(
                  'Hẹn giờ',
                  style: TextStyle(
                    fontWeight: FontWeight.bold,
                    color: AppColors.textPrimary,
                  ),
                ),
              ),
              FilledButton.tonalIcon(
                key: const ValueKey<String>('device-schedule-add'),
                onPressed: suspended || overview == null
                    ? null
                    : () => _add(context, ref, overview),
                icon: const Icon(Icons.add, size: 18),
                label: const Text('Thêm hẹn giờ'),
              ),
            ],
          ),
          if (suspended) ...[
            const SizedBox(height: 8),
            const Text(
              'Dịch vụ của nhà đang tạm ngưng nên chưa tạo được hẹn giờ mới.',
              style: TextStyle(color: AppColors.critical, fontSize: 12),
            ),
          ],
          const SizedBox(height: 10),
          body,
        ],
      ),
    );
  }

  Future<void> _add(
    BuildContext context,
    WidgetRef ref,
    HomeOverview overview,
  ) async {
    final messenger = ScaffoldMessenger.maybeOf(context);
    final created = await showCreateScheduleSheet(
      context,
      homeId: homeId,
      timezone: overview.home.timezone,
      devices: [device],
      defaultDeviceId: device.id,
    );
    if (created) showAppSnack(messenger, 'Đã tạo hẹn giờ.');
  }
}
