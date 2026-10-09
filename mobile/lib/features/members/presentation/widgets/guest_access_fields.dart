import 'package:flutter/material.dart';

import '../../../../core/theme/app_theme.dart';
import '../../../../core/widgets/app_widgets.dart';
import '../../../devices/domain/device.dart';
import '../../../devices/presentation/device_presentation.dart';
import '../../domain/member.dart';

/// Expiry presets for GUEST access (≤ 30 days, FR-6.3).
const guestDurationOptions = [1, 3, 7, 14, maxGuestAccessDays];

String guestDurationLabel(int days) => days == 1 ? '1 ngày' : '$days ngày';

/// GUEST-only inputs: validity (preset days) and the allowed devices.
class GuestAccessFields extends StatelessWidget {
  const GuestAccessFields({
    super.key,
    required this.devices,
    required this.days,
    required this.selected,
    required this.onDaysChanged,
    required this.onSelectionChanged,
    this.error,
  });

  final List<CustomerDevice> devices;
  final int days;
  final Set<int> selected;
  final ValueChanged<int> onDaysChanged;
  final ValueChanged<Set<int>> onSelectionChanged;
  final String? error;

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        const Text(
          'Thời hạn truy cập (tối đa 30 ngày)',
          style: TextStyle(fontWeight: FontWeight.bold),
        ),
        const SizedBox(height: 8),
        Wrap(
          spacing: 8,
          runSpacing: 8,
          children: [
            for (final option in guestDurationOptions)
              ChoicePill(
                label: guestDurationLabel(option),
                selected: days == option,
                onTap: () => onDaysChanged(option),
              ),
          ],
        ),
        const SizedBox(height: 16),
        const Text(
          'Thiết bị được phép dùng',
          style: TextStyle(fontWeight: FontWeight.bold),
        ),
        const SizedBox(height: 4),
        for (final device in devices)
          CheckboxListTile(
            contentPadding: EdgeInsets.zero,
            controlAffinity: ListTileControlAffinity.leading,
            dense: true,
            value: selected.contains(device.id),
            title: Text(device.name),
            subtitle: Text(
              [
                deviceCategoryLabel(device.category),
                ?device.roomName,
              ].join(' · '),
            ),
            onChanged: (checked) {
              final next = {...selected};
              checked == true ? next.add(device.id) : next.remove(device.id);
              onSelectionChanged(next);
            },
          ),
        if (error != null)
          Padding(
            padding: const EdgeInsets.only(top: 4),
            child: Text(
              error!,
              style: const TextStyle(color: AppColors.critical, fontSize: 12),
            ),
          ),
      ],
    );
  }
}
