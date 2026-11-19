import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../../core/theme/app_theme.dart';
import '../../../../core/utils/date_format.dart';
import '../../../../core/widgets/app_widgets.dart';
import '../../../homes/homes.dart';
import '../../application/device_control_providers.dart';
import '../../application/device_providers.dart';
import '../../domain/appliance.dart';
import '../../domain/curtain.dart';
import '../../domain/device.dart';
import '../../ui/curtain_level_buttons.dart';
import '../../ui/device_presentation.dart';
import 'ac_control_panel.dart';

/// Control block of a relay on the detail page, by what it drives:
/// - switch (lamp, fan, plain relay, or an air conditioner that only looks like
///   one by its name): "Bật / Tắt" with an optimistic switch;
/// - curtain: state + "Đóng · 50% · 100%";
/// - air conditioner the backend has classified: room temperature + the full
///   panel ([AcControlPanel]).
class RelayControl extends ConsumerWidget {
  const RelayControl({super.key, required this.device, required this.home});

  final CustomerDevice device;
  final HomeOverview home;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final pending = ref.watch(
      pendingCommandsProvider.select((ids) => ids.contains(device.id)),
    );
    final adjusting = ref.watch(
      setpointDraftsProvider.select((drafts) => drafts.containsKey(device.id)),
    );
    final suspended = home.home.isSuspended;
    final hint = deviceControlHint(device, homeSuspended: suspended);
    final kind = ApplianceKind.of(device) ?? ApplianceKind.plainSwitch;
    final enabled = hint == null && !pending && !adjusting;
    final isAc = kind == ApplianceKind.airConditioner;

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        if (kind == ApplianceKind.curtain)
          _CurtainCard(
            device: device,
            pending: pending,
            homeSuspended: suspended,
          )
        else if (!device.isAirConditioner)
          _SwitchCard(
            device: device,
            kind: kind,
            pending: pending,
            enabled: enabled,
          ),
        if (isAc) ...[
          // The classified air conditioner has no separate switch card above.
          if (!device.isAirConditioner) const SizedBox(height: 12),
          _RoomTemperature(room: home.roomById(device.roomId ?? -1)),
          const SizedBox(height: 12),
          if (device.isAirConditioner)
            AcControlPanel(device: device, homeSuspended: suspended)
          else
            const InlineBanner(
              message:
                  'Thiết bị này chưa được khai báo là điều hòa nên chỉ bật/tắt được.',
            ),
        ],
        if (hint != null) ...[
          const SizedBox(height: 12),
          InlineBanner(
            message: hint,
            kind: device.canControl && !device.isBlocked
                ? BannerKind.warning
                : BannerKind.info,
          ),
        ],
      ],
    );
  }
}

class _SwitchCard extends ConsumerWidget {
  const _SwitchCard({
    required this.device,
    required this.kind,
    required this.pending,
    required this.enabled,
  });

  final CustomerDevice device;
  final ApplianceKind kind;
  final bool pending;
  final bool enabled;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    return AppCard(
      child: Row(
        children: [
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const Text(
                  'Bật / Tắt',
                  style: TextStyle(
                    fontWeight: FontWeight.bold,
                    fontSize: 16,
                    color: AppColors.textPrimary,
                  ),
                ),
                const SizedBox(height: 2),
                Text(
                  pending
                      ? 'Đang gửi lệnh tới thiết bị…'
                      : kind.stateOf(device.isOn),
                  style: const TextStyle(color: AppColors.textSecondary),
                ),
              ],
            ),
          ),
          const SizedBox(width: 12),
          if (pending)
            const SizedBox(
              width: 24,
              height: 24,
              child: CircularProgressIndicator(strokeWidth: 2.5),
            )
          else
            Switch(
              key: const ValueKey<String>('device-power-switch'),
              value: device.isOn,
              onChanged: enabled
                  ? (value) => togglePower(context, ref, device, value)
                  : null,
            ),
        ],
      ),
    );
  }
}

class _CurtainCard extends StatelessWidget {
  const _CurtainCard({
    required this.device,
    required this.pending,
    required this.homeSuspended,
  });

  final CustomerDevice device;
  final bool pending;
  final bool homeSuspended;

  @override
  Widget build(BuildContext context) {
    return AppCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Row(
            children: [
              Expanded(
                child: Text(
                  curtainStatusText(device.curtainPos, device.power),
                  key: const ValueKey<String>('curtain-status'),
                  style: const TextStyle(
                    fontWeight: FontWeight.bold,
                    fontSize: 16,
                    color: AppColors.textPrimary,
                  ),
                ),
              ),
              if (pending)
                const SizedBox(
                  width: 20,
                  height: 20,
                  child: CircularProgressIndicator(strokeWidth: 2.5),
                ),
            ],
          ),
          const SizedBox(height: 2),
          Text(
            pending ? 'Đang chờ thiết bị xác nhận…' : curtainHint,
            style: const TextStyle(color: AppColors.textSecondary),
          ),
          const SizedBox(height: 14),
          CurtainLevelButtons(
            device: device,
            homeSuspended: homeSuspended,
            large: true,
          ),
        ],
      ),
    );
  }
}

class _RoomTemperature extends StatelessWidget {
  const _RoomTemperature({required this.room});

  final RoomSummary? room;

  @override
  Widget build(BuildContext context) {
    final temperature = room?.temperature;
    final has = (room?.hasClimateData ?? false) && temperature != null;
    return AppCard(
      child: Row(
        children: [
          const IconBadge(icon: Icons.thermostat_outlined),
          const SizedBox(width: 14),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const Text(
                  'Nhiệt độ phòng',
                  style: TextStyle(
                    fontSize: 12,
                    color: AppColors.textSecondary,
                  ),
                ),
                Text(
                  has ? formatTemperature(temperature) : 'Chưa có số đo',
                  key: const ValueKey<String>('room-temperature'),
                  style: const TextStyle(
                    fontSize: 20,
                    fontWeight: FontWeight.bold,
                    color: AppColors.textPrimary,
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
