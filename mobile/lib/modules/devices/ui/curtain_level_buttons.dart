import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/theme/app_theme.dart';
import '../application/device_providers.dart';
import '../domain/curtain.dart';
import '../domain/device.dart';
import 'device_presentation.dart';

/// Curtain control: "Đóng · 50% · 100%" (sends `set_pos` 0 / 50 / 100). The
/// button of the current level is filled and cannot be tapped again; everything
/// is locked while the device is offline, the role may not control it, or a
/// command is waiting for its ack (FR-5.3, FR-5.5).
class CurtainLevelButtons extends ConsumerWidget {
  const CurtainLevelButtons({
    super.key,
    required this.device,
    this.homeSuspended = false,
    this.onDark = false,
    this.large = false,
  });

  final CustomerDevice device;
  final bool homeSuspended;

  /// On a filled (primary) tile: white-on-blue instead of blue-on-tint.
  final bool onDark;

  /// The big variant of the detail page.
  final bool large;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final pending = ref.watch(
      pendingCommandsProvider.select((ids) => ids.contains(device.id)),
    );
    final blocked = deviceControlHint(device, homeSuspended: homeSuspended);
    final enabled = blocked == null && !pending;
    final active = activeCurtainLevel(device.curtainPos, device.power);

    final track = onDark
        ? Colors.white.withValues(alpha: 0.18)
        : AppColors.surfaceTint;
    return Container(
      key: ValueKey<String>('curtain-levels-${device.id}'),
      padding: const EdgeInsets.all(3),
      decoration: BoxDecoration(
        color: track,
        borderRadius: BorderRadius.circular(large ? 16 : 12),
      ),
      child: Row(
        children: [
          for (final level in curtainLevels)
            Expanded(
              child: _LevelButton(
                key: ValueKey<String>('curtain-${device.id}-${level.position}'),
                label: level.label,
                selected: active == level.position,
                enabled: enabled,
                onDark: onDark,
                large: large,
                onTap: () =>
                    setCurtainLevel(context, ref, device, level.position),
              ),
            ),
        ],
      ),
    );
  }
}

class _LevelButton extends StatelessWidget {
  const _LevelButton({
    super.key,
    required this.label,
    required this.selected,
    required this.enabled,
    required this.onDark,
    required this.large,
    required this.onTap,
  });

  final String label;
  final bool selected;
  final bool enabled;
  final bool onDark;
  final bool large;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final fill = selected
        ? (onDark ? Colors.white : AppColors.primary)
        : Colors.transparent;
    var text = selected
        ? (onDark ? AppColors.primary : Colors.white)
        : (onDark ? Colors.white : AppColors.textPrimary);
    if (!enabled && !selected) text = text.withValues(alpha: 0.45);
    return Semantics(
      button: true,
      selected: selected,
      enabled: enabled && !selected,
      label: label == 'Đóng' ? 'Đóng rèm' : 'Mở rèm $label',
      excludeSemantics: true,
      child: Material(
        color: fill,
        borderRadius: BorderRadius.circular(large ? 13 : 10),
        child: InkWell(
          borderRadius: BorderRadius.circular(large ? 13 : 10),
          // A locked button still swallows the tap, so it does not open the
          // device page that the tile around it opens.
          onTap: enabled && !selected ? onTap : () {},
          splashFactory: enabled && !selected ? null : NoSplash.splashFactory,
          child: Padding(
            padding: EdgeInsets.symmetric(vertical: large ? 11 : 7),
            child: Center(
              child: Text(
                label,
                maxLines: 1,
                style: TextStyle(
                  color: text,
                  fontWeight: FontWeight.w700,
                  fontSize: large ? 14 : 11.5,
                ),
              ),
            ),
          ),
        ),
      ),
    );
  }
}
