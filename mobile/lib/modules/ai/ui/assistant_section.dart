import 'package:flutter/material.dart';

import '../../../core/theme/app_theme.dart';

/// Bordered block under an Assistant bubble ("Đã làm", "Đã hẹn", "Cần xác
/// nhận"…), indented to line up with the bubble text.
class AssistantSection extends StatelessWidget {
  const AssistantSection({
    super.key,
    required this.title,
    required this.icon,
    required this.child,
    this.iconColor = AppColors.primary,
    this.highlight = false,
  });

  final String title;
  final IconData icon;
  final Color iconColor;
  final Widget child;

  /// A tinted border for blocks that wait for the user.
  final bool highlight;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(left: 36),
      child: Material(
        color: AppColors.surface,
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(14),
          side: BorderSide(
            color: highlight
                ? AppColors.primary.withValues(alpha: 0.4)
                : AppColors.track,
          ),
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Padding(
              padding: const EdgeInsets.fromLTRB(12, 10, 12, 0),
              child: Row(
                children: [
                  Icon(icon, size: 16, color: iconColor),
                  const SizedBox(width: 6),
                  Text(
                    title,
                    style: Theme.of(context).textTheme.labelLarge?.copyWith(
                      fontWeight: FontWeight.w700,
                      color: AppColors.textPrimary,
                    ),
                  ),
                ],
              ),
            ),
            child,
          ],
        ),
      ),
    );
  }
}
