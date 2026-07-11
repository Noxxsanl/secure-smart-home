import 'package:flutter/material.dart';

import '../../../../core/theme/app_theme.dart';
import '../../../devices/data/mock_devices.dart';
import '../../models/room.dart';

class RoomCard extends StatelessWidget {
  const RoomCard({super.key, required this.room, required this.onTap});

  final Room room;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final deviceCount = MockDevices.forRoom(room.id).length;

    return Material(
      color: AppColors.surface,
      borderRadius: BorderRadius.circular(24),
      child: InkWell(
        borderRadius: BorderRadius.circular(24),
        onTap: onTap,
        child: Padding(
          padding: const EdgeInsets.all(18),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                children: [
                  Container(
                    padding: const EdgeInsets.all(12),
                    decoration: BoxDecoration(
                      color: AppColors.surfaceTint,
                      borderRadius: BorderRadius.circular(16),
                    ),
                    child: Icon(room.icon, size: 26, color: AppColors.primary),
                  ),
                  if (room.hasClimateData)
                    Text(
                      '${room.temperature.round()}°',
                      style: const TextStyle(
                        fontWeight: FontWeight.bold,
                        fontSize: 18,
                        color: AppColors.primary,
                      ),
                    ),
                ],
              ),
              const Spacer(),
              Text(
                room.name,
                style: const TextStyle(
                  fontWeight: FontWeight.bold,
                  fontSize: 15,
                ),
              ),
              const SizedBox(height: 2),
              if (room.hasClimateData) ...[
                Row(
                  children: [
                    const Icon(
                      Icons.water_drop_outlined,
                      size: 12,
                      color: AppColors.textSecondary,
                    ),
                    const SizedBox(width: 4),
                    Text(
                      '${room.humidity}% · $deviceCount devices',
                      style: const TextStyle(
                        fontSize: 12,
                        color: AppColors.textSecondary,
                      ),
                    ),
                  ],
                ),
              ] else
                Text(
                  '$deviceCount devices',
                  style: const TextStyle(
                    fontSize: 12,
                    color: AppColors.textSecondary,
                  ),
                ),
            ],
          ),
        ),
      ),
    );
  }
}
