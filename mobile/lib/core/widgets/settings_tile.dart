import 'package:flutter/material.dart';

import '../theme/app_theme.dart';

/// A single row inside a [SettingsSection] — icon, title, optional subtitle
/// and a trailing widget (chevron by default, or a custom control).
class SettingsTile extends StatelessWidget {
  const SettingsTile({
    super.key,
    required this.icon,
    required this.title,
    this.subtitle,
    this.trailing,
    this.onTap,
    this.destructive = false,
    this.enabled = true,
  });

  final IconData icon;
  final String title;
  final String? subtitle;
  final Widget? trailing;
  final VoidCallback? onTap;
  final bool destructive;
  final bool enabled;

  @override
  Widget build(BuildContext context) {
    final color = destructive ? Colors.redAccent : AppColors.textPrimary;
    final iconColor = destructive ? Colors.redAccent : AppColors.primary;

    return Opacity(
      opacity: enabled ? 1 : 0.5,
      child: InkWell(
        onTap: enabled ? onTap : null,
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
          child: Row(
            children: [
              Container(
                padding: const EdgeInsets.all(9),
                decoration: BoxDecoration(
                  color: destructive
                      ? Colors.redAccent.withValues(alpha: 0.1)
                      : AppColors.surfaceTint,
                  borderRadius: BorderRadius.circular(12),
                ),
                child: Icon(icon, size: 19, color: iconColor),
              ),
              const SizedBox(width: 14),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      title,
                      style: TextStyle(
                        fontWeight: FontWeight.w600,
                        color: color,
                      ),
                    ),
                    if (subtitle != null) ...[
                      const SizedBox(height: 2),
                      Text(
                        subtitle!,
                        style: const TextStyle(
                          fontSize: 12,
                          color: AppColors.textSecondary,
                        ),
                      ),
                    ],
                  ],
                ),
              ),
              const SizedBox(width: 8),
              trailing ??
                  (onTap != null
                      ? const Icon(
                          Icons.chevron_right,
                          color: AppColors.textSecondary,
                        )
                      : const SizedBox.shrink()),
            ],
          ),
        ),
      ),
    );
  }
}

/// Groups related [SettingsTile]s under a section label inside one rounded
/// card, with hairline dividers between rows.
class SettingsSection extends StatelessWidget {
  const SettingsSection({super.key, this.title, required this.children});

  final String? title;
  final List<Widget> children;

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        if (title != null) ...[
          Padding(
            padding: const EdgeInsets.only(left: 4, bottom: 10),
            child: Text(
              title!,
              style: const TextStyle(
                fontSize: 13,
                fontWeight: FontWeight.bold,
                color: AppColors.textSecondary,
              ),
            ),
          ),
        ],
        Material(
          color: AppColors.surface,
          borderRadius: BorderRadius.circular(20),
          child: Column(
            children: [
              for (var i = 0; i < children.length; i++) ...[
                if (i > 0)
                  const Divider(
                    height: 1,
                    indent: 16,
                    endIndent: 16,
                    color: AppColors.track,
                  ),
                children[i],
              ],
            ],
          ),
        ),
      ],
    );
  }
}
