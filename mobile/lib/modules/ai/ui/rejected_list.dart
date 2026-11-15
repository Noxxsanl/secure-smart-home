import 'package:flutter/material.dart';

import '../../../core/theme/app_theme.dart';

/// "Không làm được": one explanatory sentence per step the Assistant skipped.
class RejectedList extends StatelessWidget {
  const RejectedList({super.key, required this.messages});

  final List<String> messages;

  @override
  Widget build(BuildContext context) {
    if (messages.isEmpty) return const SizedBox.shrink();
    final style = Theme.of(
      context,
    ).textTheme.bodySmall?.copyWith(color: AppColors.warning);
    return Padding(
      padding: const EdgeInsets.only(left: 36),
      child: Container(
        key: const ValueKey('assistant-rejected'),
        width: double.infinity,
        padding: const EdgeInsets.all(12),
        decoration: BoxDecoration(
          color: AppColors.warning.withValues(alpha: 0.1),
          borderRadius: BorderRadius.circular(12),
          border: Border.all(color: AppColors.warning.withValues(alpha: 0.3)),
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              'Không làm được',
              style: style?.copyWith(fontWeight: FontWeight.w700),
            ),
            for (final message in messages)
              Padding(
                padding: const EdgeInsets.only(top: 4),
                child: Text(message, style: style),
              ),
          ],
        ),
      ),
    );
  }
}
