import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/theme/app_theme.dart';
import '../application/device_control_providers.dart';
import '../application/device_providers.dart';
import '../domain/appliance.dart';
import '../domain/device.dart';
import 'device_presentation.dart';

/// "Đặt 26°C" with − / + (1 °C steps, 16..30) for an air conditioner the
/// backend has classified. The number follows the taps at once; many taps in a
/// row become one command (the notifier waits 600 ms of quiet). Locked for the
/// same reasons as the switch, and while a command is on its way (FR-5.5).
class AcSetpointControl extends ConsumerWidget {
  const AcSetpointControl({
    super.key,
    required this.device,
    this.homeSuspended = false,
    this.onDark = false,
  });

  final CustomerDevice device;
  final bool homeSuspended;

  /// On a filled (primary) tile: white instead of dark text.
  final bool onDark;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final draft = ref.watch(
      setpointDraftsProvider.select((drafts) => drafts[device.id]),
    );
    final sending = ref.watch(
      pendingCommandsProvider.select((ids) => ids.contains(device.id)),
    );
    final learning = ref.watch(
      acLearnProvider.select((s) => s.isLearningDevice(device.id)),
    );
    final value = draft ?? device.acSetpoint;
    final enabled =
        deviceControlHint(device, homeSuspended: homeSuspended) == null &&
        !sending &&
        !learning;
    final color = draft != null
        ? (onDark ? Colors.white : AppColors.primary)
        : (onDark ? Colors.white : AppColors.textPrimary);

    return Semantics(
      container: true,
      label: 'Nhiệt độ đặt của ${device.name}',
      child: Row(
        children: [
          Expanded(
            child: Text(
              value == null ? 'Đặt --' : 'Đặt $value°C',
              key: ValueKey<String>('ac-setpoint-${device.id}'),
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
              style: TextStyle(
                color: color,
                fontWeight: FontWeight.w700,
                fontSize: 13,
              ),
            ),
          ),
          _StepButton(
            key: ValueKey<String>('ac-minus-${device.id}'),
            icon: Icons.remove,
            tooltip: 'Giảm 1°C',
            onDark: onDark,
            onTap: enabled && (value == null || value > acSetpointMin)
                ? () => adjustAcSetpoint(context, ref, device, -1)
                : null,
          ),
          const SizedBox(width: 4),
          _StepButton(
            key: ValueKey<String>('ac-plus-${device.id}'),
            icon: Icons.add,
            tooltip: 'Tăng 1°C',
            onDark: onDark,
            onTap: enabled && (value == null || value < acSetpointMax)
                ? () => adjustAcSetpoint(context, ref, device, 1)
                : null,
          ),
        ],
      ),
    );
  }
}

class _StepButton extends StatelessWidget {
  const _StepButton({
    super.key,
    required this.icon,
    required this.tooltip,
    required this.onDark,
    required this.onTap,
  });

  final IconData icon;
  final String tooltip;
  final bool onDark;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    final enabled = onTap != null;
    final foreground = onDark ? Colors.white : AppColors.primary;
    return Tooltip(
      message: tooltip,
      child: Material(
        color: onDark
            ? Colors.white.withValues(alpha: 0.18)
            : AppColors.surfaceTint,
        borderRadius: BorderRadius.circular(9),
        child: InkWell(
          borderRadius: BorderRadius.circular(9),
          // A locked button still swallows the tap (see CurtainLevelButtons).
          onTap: onTap ?? () {},
          splashFactory: enabled ? null : NoSplash.splashFactory,
          child: SizedBox(
            width: 28,
            height: 28,
            child: Icon(
              icon,
              size: 16,
              color: enabled ? foreground : foreground.withValues(alpha: 0.35),
            ),
          ),
        ),
      ),
    );
  }
}
