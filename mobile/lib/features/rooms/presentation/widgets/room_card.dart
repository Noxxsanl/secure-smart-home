import 'package:flutter/material.dart';

import '../../../../core/theme/app_theme.dart';
import '../../../../core/utils/date_format.dart';
import '../../domain/room.dart';
import '../room_presentation.dart';

/// Room tile with the climate summary (FR-5.1/5.2): temperature top-right,
/// humidity and device counters below.
class RoomCard extends StatelessWidget {
  const RoomCard({super.key, required this.room, required this.onTap});

  final RoomSummary room;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final temperature = room.temperature;
    final countsText = room.onCount > 0
        ? '${room.deviceCount} thiết bị · ${room.onCount} đang bật'
        : '${room.deviceCount} thiết bị';

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
                    child: Icon(
                      roomIcon(room.roomType),
                      size: 26,
                      color: AppColors.primary,
                    ),
                  ),
                  if (room.hasClimateData && temperature != null)
                    Text(
                      '${formatNumber(temperature, fractionDigits: 0)}°',
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
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: const TextStyle(
                  fontWeight: FontWeight.bold,
                  fontSize: 15,
                ),
              ),
              const SizedBox(height: 2),
              Row(
                children: [
                  if (room.hasClimateData && room.humidity != null) ...[
                    const Icon(
                      Icons.water_drop_outlined,
                      size: 12,
                      color: AppColors.textSecondary,
                    ),
                    const SizedBox(width: 4),
                    Text(
                      formatHumidity(room.humidity),
                      style: const TextStyle(
                        fontSize: 12,
                        color: AppColors.textSecondary,
                      ),
                    ),
                    const Text(
                      ' · ',
                      style: TextStyle(color: AppColors.textSecondary),
                    ),
                  ],
                  Expanded(
                    child: Text(
                      countsText,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: const TextStyle(
                        fontSize: 12,
                        color: AppColors.textSecondary,
                      ),
                    ),
                  ),
                ],
              ),
            ],
          ),
        ),
      ),
    );
  }
}
