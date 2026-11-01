import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../../core/network/api_exception.dart';
import '../../../../core/network/error_messages.dart';
import '../../../../core/theme/app_theme.dart';
import '../../../../core/utils/date_format.dart';
import '../../../../core/widgets/app_feedback.dart';
import '../../../../core/widgets/app_widgets.dart';
import '../../../../core/widgets/async_views.dart';
import '../../../homes/homes.dart';
import '../../application/automation_providers.dart';
import '../../domain/automation_rule.dart';
import '../../domain/rule_description.dart';
import '../../ui/suggestion_card.dart';
import 'rule_editor_page.dart';
import 'rule_history_page.dart';

/// "Tự động" tab (FR-7.1, 7.2): rules, history and AI suggestions.
class AutomationPage extends ConsumerWidget {
  const AutomationPage({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final home = ref.watch(currentHomeProvider);
    if (home == null) return const Scaffold(body: LoadingView());
    final role = home.role;

    Widget body;
    if (!role.canViewAutomation) {
      body = const _GuestExplanation();
    } else {
      final rules = ref.watch(automationRulesProvider(home.id));
      final denied =
          rules.error is ApiException &&
          (rules.error! as ApiException).statusCode == 403;
      body = denied
          ? const _GuestExplanation()
          : AsyncValueView<List<AutomationRule>>(
              value: rules,
              errorContext: ErrorContext.automation,
              onRetry: () => ref.invalidate(automationRulesProvider(home.id)),
              builder: (data) => _Content(home: home, rules: data),
            );
    }

    return Scaffold(
      appBar: AppBar(
        automaticallyImplyLeading: false,
        title: const Text('Tự động'),
      ),
      body: body,
      floatingActionButton: role.canEditAutomation && !home.home.isSuspended
          ? FloatingActionButton.extended(
              onPressed: () => Navigator.of(context).push(
                MaterialPageRoute<void>(
                  builder: (_) => RuleEditorPage(homeId: home.id),
                ),
              ),
              icon: const Icon(Icons.add),
              label: const Text('Tạo quy tắc'),
            )
          : null,
    );
  }
}

class _GuestExplanation extends StatelessWidget {
  const _GuestExplanation();

  @override
  Widget build(BuildContext context) => const EmptyState(
    icon: Icons.lock_outline,
    title: 'Khách không xem được tự động hoá',
    message:
        'Quy tắc tự động và gợi ý chỉ dành cho chủ nhà, người điều khiển và người chỉ xem. '
        'Liên hệ chủ nhà nếu bạn cần quyền này.',
  );
}

class _Content extends ConsumerWidget {
  const _Content({required this.home, required this.rules});

  final MyHome home;
  final List<AutomationRule> rules;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final suggestions = (ref.watch(suggestionsProvider(home.id)).value ?? [])
        .where((s) => s.isPending)
        .toList();
    final canEdit = home.role.canEditAutomation;

    return RefreshIndicator(
      onRefresh: () async {
        await ref.read(automationRulesProvider(home.id).notifier).refresh();
        await ref.read(suggestionsProvider(home.id).notifier).refresh();
      },
      child: ListView(
        physics: const AlwaysScrollableScrollPhysics(),
        padding: const EdgeInsets.fromLTRB(20, 0, 20, 100),
        children: [
          if (!canEdit) ...[
            const InlineBanner(
              message:
                  'Bạn chỉ có quyền xem. Chỉ chủ nhà hoặc người điều khiển mới tạo và chỉnh sửa được quy tắc.',
            ),
            const SizedBox(height: 16),
          ],
          if (home.home.isSuspended) ...[
            const InlineBanner(
              kind: BannerKind.warning,
              message:
                  'Nhà đang tạm ngưng dịch vụ nên chưa thay đổi được quy tắc.',
            ),
            const SizedBox(height: 16),
          ],
          for (final s in suggestions) ...[
            SuggestionCard(suggestion: s, canRespond: canEdit),
            const SizedBox(height: 12),
          ],
          if (suggestions.isNotEmpty) const SizedBox(height: 8),
          const SectionHeader('Quy tắc'),
          if (rules.isEmpty)
            const Padding(
              padding: EdgeInsets.symmetric(vertical: 32),
              child: EmptyState(
                icon: Icons.auto_mode_outlined,
                title: 'Chưa có quy tắc nào',
                message:
                    'Tạo quy tắc để tự bật/tắt thiết bị theo nhiệt độ, độ ẩm hoặc lịch.',
              ),
            )
          else
            for (final rule in rules)
              Padding(
                padding: const EdgeInsets.only(bottom: 12),
                child: _RuleCard(homeId: home.id, rule: rule),
              ),
        ],
      ),
    );
  }
}

class _RuleCard extends ConsumerWidget {
  const _RuleCard({required this.homeId, required this.rule});

  final int homeId;
  final AutomationRule rule;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final notifier = ref.read(automationRulesProvider(homeId).notifier);
    return AppCard(
      onTap: () => Navigator.of(context).push(
        MaterialPageRoute<void>(builder: (_) => RuleHistoryPage(rule: rule)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              IconBadge(
                icon: rule.triggerType == TriggerType.schedule
                    ? Icons.schedule
                    : Icons.sensors,
              ),
              const SizedBox(width: 12),
              Expanded(
                child: Text(
                  rule.name,
                  style: const TextStyle(
                    fontWeight: FontWeight.bold,
                    color: AppColors.textPrimary,
                  ),
                ),
              ),
              Switch(
                key: ValueKey<String>('rule-switch-${rule.id}'),
                value: rule.enabled,
                onChanged: rule.canEdit
                    ? (value) => runAction(
                        context,
                        () => notifier.setEnabled(rule.id, value),
                        errorContext: ErrorContext.automation,
                      )
                    : null,
              ),
              if (rule.canDelete)
                PopupMenuButton<String>(
                  tooltip: 'Tuỳ chọn',
                  onSelected: (_) async {
                    final ok = await confirmDialog(
                      context,
                      title: 'Xoá quy tắc?',
                      message: 'Quy tắc “${rule.name}” sẽ bị xoá và không còn chạy nữa.',
                      confirmLabel: 'Xoá',
                      destructive: true,
                    );
                    if (ok && context.mounted) {
                      await runAction(
                        context,
                        () => notifier.delete(rule.id),
                        errorContext: ErrorContext.automation,
                        successMessage: 'Đã xoá quy tắc.',
                      );
                    }
                  },
                  itemBuilder: (_) => const [
                    PopupMenuItem(value: 'delete', child: Text('Xoá quy tắc')),
                  ],
                ),
            ],
          ),
          const SizedBox(height: 8),
          Text(
            describeRule(rule),
            style: const TextStyle(
              color: AppColors.textSecondary,
              height: 1.4,
              fontSize: 13,
            ),
          ),
          const SizedBox(height: 8),
          Wrap(
            spacing: 8,
            runSpacing: 4,
            crossAxisAlignment: WrapCrossAlignment.center,
            children: [
              if (rule.origin == RuleOrigin.aiSuggested) const AiBadge(),
              Text(
                rule.lastTriggeredAt == null
                    ? 'Chưa chạy lần nào'
                    : 'Chạy gần nhất ${formatRelative(rule.lastTriggeredAt!)}',
                style: const TextStyle(
                  fontSize: 11,
                  color: AppColors.textSecondary,
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }
}
