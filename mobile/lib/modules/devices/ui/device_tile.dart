import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/theme/app_theme.dart';
import '../application/device_control_providers.dart';
import '../application/device_providers.dart';
import '../domain/appliance.dart';
import '../domain/device.dart';
import 'ac_setpoint_control.dart';
import 'curtain_level_buttons.dart';
import 'device_presentation.dart';

/// Grid tile for a relay on the Home screen: the switch is optimistic
/// (FR-5.3) and disabled when the device is offline or the role may not
/// control it (FR-5.5). A curtain has the three levels "Đóng · 50% · 100%"
/// instead of a switch; an air conditioner the backend has classified also has
/// "Đặt 26°C" with − / +.
class DeviceTile extends ConsumerWidget {
  const DeviceTile({
    super.key,
    required this.device,
    required this.onTap,
    this.homeSuspended = false,
  });

  final CustomerDevice device;
  final VoidCallback onTap;
  final bool homeSuspended;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final pending = ref.watch(
      pendingCommandsProvider.select((ids) => ids.contains(device.id)),
    );
    final adjusting = ref.watch(
      setpointDraftsProvider.select((drafts) => drafts.containsKey(device.id)),
    );
    final hint = deviceControlHint(device, homeSuspended: homeSuspended);
    final canToggle = hint == null && !pending && !adjusting;
    final isCurtain = ApplianceKind.of(device) == ApplianceKind.curtain;
    final isOn = device.isOn;
    final foreground = isOn ? Colors.white : AppColors.textPrimary;
    final muted = isOn ? Colors.white70 : AppColors.textSecondary;

    return Material(
      color: isOn ? AppColors.primary : AppColors.surface,
      borderRadius: BorderRadius.circular(24),
      child: InkWell(
        borderRadius: BorderRadius.circular(24),
        onTap: onTap,
        child: Padding(
          padding: const EdgeInsets.all(16),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                children: [
                  Container(
                    padding: const EdgeInsets.all(10),
                    decoration: BoxDecoration(
                      color: isOn
                          ? Colors.white.withValues(alpha: 0.18)
                          : AppColors.surfaceTint,
                      borderRadius: BorderRadius.circular(14),
                    ),
                    child: Icon(
                      deviceIcon(device),
                      color: isOn ? Colors.white : AppColors.primary,
                      size: 22,
                    ),
                  ),
                  if (isCurtain && !pending)
                    const SizedBox(height: 40)
                  else if (pending)
                    Padding(
                      padding: const EdgeInsets.all(8),
                      child: SizedBox(
                        width: 20,
                        height: 20,
                        child: CircularProgressIndicator(
                          strokeWidth: 2.5,
                          color: foreground,
                        ),
                      ),
                    )
                  else
                    Transform.scale(
                      scale: 0.85,
                      child: Switch(
                        key: ValueKey<String>('switch-${device.id}'),
                        value: isOn,
                        onChanged: canToggle
                            ? (value) =>
                                  togglePower(context, ref, device, value)
                            : null,
                        activeTrackColor: Colors.white,
                        activeThumbColor: AppColors.primary,
                        inactiveTrackColor: AppColors.track,
                        inactiveThumbColor: Colors.white,
                      ),
                    ),
                ],
              ),
              const Spacer(),
              Text(
                device.name,
                maxLines: 2,
                overflow: TextOverflow.ellipsis,
                style: TextStyle(
                  color: foreground,
                  fontWeight: FontWeight.bold,
                  fontSize: 15,
                ),
              ),
              const SizedBox(height: 2),
              Text(
                !device.online ? 'Ngoại tuyến' : deviceSubtitle(device),
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: TextStyle(color: muted, fontSize: 12),
              ),
              if (isCurtain) ...[
                const SizedBox(height: 8),
                CurtainLevelButtons(
                  device: device,
                  homeSuspended: homeSuspended,
                  onDark: isOn,
                ),
              ] else if (device.isAirConditioner) ...[
                const SizedBox(height: 6),
                AcSetpointControl(
                  device: device,
                  homeSuspended: homeSuspended,
                  onDark: isOn,
                ),
              ],
            ],
          ),
        ),
      ),
    );
  }
}
