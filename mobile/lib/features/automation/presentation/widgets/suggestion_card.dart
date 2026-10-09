import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../../core/network/error_messages.dart';
import '../../../../core/theme/app_theme.dart';
import '../../../../core/widgets/app_feedback.dart';
import '../../../../core/widgets/app_widgets.dart';
import '../../domain/automation_rule.dart';
import '../../domain/rule_description.dart';
import '../providers/automation_providers.dart';

/// AI habit suggestion (FR-7.5): the only actions are "Chấp nhận" (creates a
/// rule) and "Bỏ qua". Nothing runs until the user accepts.
class SuggestionCard extends ConsumerStatefulWidget {
  const SuggestionCard({
    super.key,
    required this.suggestion,
    required this.canRespond,
  });

  final HabitSuggestion suggestion;
  final bool canRespond;

  @override
  ConsumerState<SuggestionCard> createState() => _SuggestionCardState();
}

class _SuggestionCardState extends ConsumerState<SuggestionCard> {
  bool _busy = false;

  Future<void> _respond(bool accept) async {
    final s = widget.suggestion;
    setState(() => _busy = true);
    final notifier = ref.read(suggestionsProvider(s.homeId).notifier);
    final ok = await runAction(
      context,
      () => accept ? notifier.accept(s.id) : notifier.dismiss(s.id),
      errorContext: ErrorContext.automation,
      successMessage: accept
          ? 'Đã tạo quy tắc tự động. Bạn có thể chỉnh trong tab Tự động.'
          : 'Đã bỏ qua gợi ý.',
    );
    if (!ok && mounted) setState(() => _busy = false);
  }

  @override
  Widget build(BuildContext context) {
    final s = widget.suggestion;
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: AppColors.surfaceTint,
        borderRadius: BorderRadius.circular(24),
        border: Border.all(color: AppColors.primary.withValues(alpha: 0.2)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Row(
            children: [
              Icon(Icons.lightbulb_outline, color: AppColors.primary, size: 20),
              SizedBox(width: 8),
              Text(
                'Gợi ý từ AI',
                style: TextStyle(
                  fontWeight: FontWeight.bold,
                  color: AppColors.primary,
                ),
              ),
            ],
          ),
          const SizedBox(height: 8),
          Text(
            describeSuggestion(
              action: s.action,
              deviceName: s.deviceName,
              timeOfDay: s.timeOfDay,
              daysMatched: s.daysMatched,
              windowDays: s.windowDays,
            ),
            style: const TextStyle(
              color: AppColors.textPrimary,
              height: 1.4,
              fontWeight: FontWeight.w600,
            ),
          ),
          const SizedBox(height: 4),
          Text(
            widget.canRespond
                ? 'Tạo quy tắc tự động ${s.action.verb} ${s.deviceName} lúc ${s.timeOfDay} mỗi ngày? Gợi ý chỉ được thực hiện sau khi bạn chấp nhận.'
                : 'Chỉ chủ nhà hoặc người điều khiển mới xử lý được gợi ý này.',
            style: const TextStyle(
              color: AppColors.textSecondary,
              fontSize: 12,
              height: 1.4,
            ),
          ),
          if (widget.canRespond) ...[
            const SizedBox(height: 12),
            Row(
              children: [
                Expanded(
                  child: FilledButton(
                    key: ValueKey<String>('accept-suggestion-${s.id}'),
                    style: FilledButton.styleFrom(
                      padding: const EdgeInsets.symmetric(vertical: 12),
                    ),
                    onPressed: _busy ? null : () => _respond(true),
                    child: const Text('Chấp nhận'),
                  ),
                ),
                const SizedBox(width: 10),
                Expanded(
                  child: OutlinedButton(
                    key: ValueKey<String>('dismiss-suggestion-${s.id}'),
                    style: OutlinedButton.styleFrom(
                      padding: const EdgeInsets.symmetric(vertical: 12),
                    ),
                    onPressed: _busy ? null : () => _respond(false),
                    child: const Text('Bỏ qua'),
                  ),
                ),
              ],
            ),
          ],
        ],
      ),
    );
  }
}

/// Small pill used on rule cards.
class AiBadge extends StatelessWidget {
  const AiBadge({super.key});

  @override
  Widget build(BuildContext context) =>
      const StatusPill('Gợi ý từ AI', icon: Icons.auto_awesome);
}
