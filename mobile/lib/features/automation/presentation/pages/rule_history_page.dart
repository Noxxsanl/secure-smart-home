import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../../core/network/error_messages.dart';
import '../../../../core/theme/app_theme.dart';
import '../../../../core/utils/date_format.dart';
import '../../../../core/widgets/app_widgets.dart';
import '../../../../core/widgets/async_views.dart';
import '../../domain/automation_rule.dart';
import '../../domain/rule_description.dart';
import '../providers/automation_providers.dart';

/// Run history of one rule (FR-7.2).
class RuleHistoryPage extends ConsumerWidget {
  const RuleHistoryPage({super.key, required this.rule});

  final AutomationRule rule;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final history = ref.watch(ruleHistoryProvider(rule.id));
    return Scaffold(
      appBar: AppBar(title: Text(rule.name)),
      body: AsyncValueView<List<RuleRun>>(
        value: history,
        errorContext: ErrorContext.automation,
        onRetry: () => ref.invalidate(ruleHistoryProvider(rule.id)),
        builder: (runs) => ListView(
          padding: const EdgeInsets.fromLTRB(20, 0, 20, 24),
          children: [
            AppCard(
              child: Text(
                describeRule(rule),
                style: const TextStyle(height: 1.4),
              ),
            ),
            const SizedBox(height: 20),
            const SectionHeader('Lịch sử chạy'),
            if (runs.isEmpty)
              const InlineBanner(message: 'Quy tắc này chưa chạy lần nào.')
            else
              for (final run in runs)
                Padding(
                  padding: const EdgeInsets.only(bottom: 10),
                  child: AppCard(
                    radius: 18,
                    padding: const EdgeInsets.all(14),
                    child: Row(
                      children: [
                        IconBadge(
                          icon: switch (run.result) {
                            RunResult.success => Icons.check_circle_outline,
                            RunResult.failed => Icons.error_outline,
                            RunResult.skipped => Icons.remove_circle_outline,
                          },
                          color: switch (run.result) {
                            RunResult.success => AppColors.success,
                            RunResult.failed => AppColors.critical,
                            RunResult.skipped => AppColors.offline,
                          },
                        ),
                        const SizedBox(width: 12),
                        Expanded(
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Text(
                                run.result.label,
                                style: const TextStyle(
                                  fontWeight: FontWeight.bold,
                                ),
                              ),
                              Text(
                                formatDateTime(run.triggeredAt),
                                style: const TextStyle(
                                  fontSize: 12,
                                  color: AppColors.textSecondary,
                                ),
                              ),
                              if (run.note != null)
                                Padding(
                                  padding: const EdgeInsets.only(top: 4),
                                  child: Text(
                                    run.note!,
                                    style: const TextStyle(fontSize: 12),
                                  ),
                                ),
                            ],
                          ),
                        ),
                      ],
                    ),
                  ),
                ),
          ],
        ),
      ),
    );
  }
}
