import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../../core/theme/app_theme.dart';
import '../../../../core/utils/date_format.dart';
import '../../../../core/widgets/app_widgets.dart';
import '../../domain/device.dart';
import '../device_presentation.dart';
import '../providers/device_providers.dart';

/// List row of a device (room detail). Relays carry an optimistic switch.
class DeviceRow extends ConsumerWidget {
  const DeviceRow({
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
    final hint = deviceControlHint(device, homeSuspended: homeSuspended);
    final subtitle = device.online
        ? deviceSubtitle(device)
        : formatLastOnline(device.lastSeen);

    return Material(
      color: AppColors.surface,
      borderRadius: BorderRadius.circular(18),
      child: InkWell(
        borderRadius: BorderRadius.circular(18),
        onTap: onTap,
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
          child: Row(
            children: [
              IconBadge(
                icon: deviceIcon(device),
                color: AppColors.primary,
                background: AppColors.surfaceTint,
              ),
              const SizedBox(width: 14),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      device.name,
                      style: const TextStyle(fontWeight: FontWeight.w600),
                    ),
                    const SizedBox(height: 2),
                    Text(
                      subtitle,
                      style: const TextStyle(
                        fontSize: 12,
                        color: AppColors.textSecondary,
                      ),
                    ),
                  ],
                ),
              ),
              StatusDot(online: device.online, size: 8),
              if (device.isRelay) ...[
                const SizedBox(width: 6),
                if (pending)
                  const Padding(
                    padding: EdgeInsets.all(12),
                    child: SizedBox(
                      width: 20,
                      height: 20,
                      child: CircularProgressIndicator(strokeWidth: 2.5),
                    ),
                  )
                else
                  Switch(
                    key: ValueKey<String>('switch-${device.id}'),
                    value: device.isOn,
                    onChanged: hint == null
                        ? (value) => togglePower(context, ref, device, value)
                        : null,
                  ),
              ] else
                const Icon(Icons.chevron_right, color: AppColors.textSecondary),
            ],
          ),
        ),
      ),
    );
  }
}
