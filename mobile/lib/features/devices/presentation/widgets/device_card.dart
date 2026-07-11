import 'package:flutter/material.dart';

import '../../../../core/theme/app_theme.dart';
import '../../models/device.dart';

class DeviceCard extends StatelessWidget {
  const DeviceCard({
    super.key,
    required this.device,
    required this.onTap,
    required this.onToggle,
  });

  final Device device;
  final VoidCallback onTap;
  final ValueChanged<bool> onToggle;

  @override
  Widget build(BuildContext context) {
    final isOn = device.isOn;
    final foreground = isOn ? Colors.white : AppColors.textPrimary;
    final iconBackground = isOn
        ? Colors.white.withValues(alpha: 0.18)
        : AppColors.surfaceTint;
    final iconColor = isOn ? Colors.white : AppColors.primary;

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
                      color: iconBackground,
                      borderRadius: BorderRadius.circular(14),
                    ),
                    child: Icon(device.icon, color: iconColor, size: 22),
                  ),
                  Transform.scale(
                    scale: 0.85,
                    child: Switch(
                      value: isOn,
                      onChanged: onToggle,
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
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: TextStyle(
                  color: foreground,
                  fontWeight: FontWeight.bold,
                  fontSize: 15,
                ),
              ),
              const SizedBox(height: 2),
              Text(
                device.type == DeviceType.temperature && isOn
                    ? '${device.temperature.round()}°'
                    : device.subtitle,
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: TextStyle(
                  color: isOn ? Colors.white70 : AppColors.textSecondary,
                  fontSize: 12,
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
