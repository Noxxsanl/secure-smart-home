import 'dart:async';

import 'package:flutter/material.dart';

import '../../../core/theme/app_theme.dart';
import '../domain/agent_reply.dart';
import '../domain/chat_entry.dart';
import '../domain/schedule_view.dart';
import 'assistant_section.dart';
import 'step_results.dart';

const _expiredText = 'Yêu cầu đã hết hạn, bạn nói lại giúp mình nhé.';

/// "Cần xác nhận": the card for commands that were not clear enough to run
/// right away (the Assistant's own suggestion, an ambiguous device…). The user
/// picks which steps to run (all are ticked), sees the time left (5 min) and
/// confirms or declines; afterwards it shows each step's result. It calls no
/// API — the feature does.
class PendingCard extends StatefulWidget {
  const PendingCard({
    super.key,
    required this.pending,
    required this.outcome,
    required this.clock,
    required this.timezone,
    required this.onConfirm,
    required this.onReject,
  });

  final AgentPending pending;
  final PendingOutcome outcome;

  /// "Now"; the card re-reads it every second while it can still be answered.
  final DateTime Function() clock;

  /// Timezone of the home (step times carry none).
  final String timezone;
  final ValueChanged<List<int>> onConfirm;
  final VoidCallback onReject;

  @override
  State<PendingCard> createState() => _PendingCardState();
}

class _PendingCardState extends State<PendingCard> {
  late final Set<int> _selected = {
    for (final step in widget.pending.steps) step.index,
  };
  Timer? _timer;

  bool get _answerable =>
      widget.outcome is PendingOpen ||
      widget.outcome is PendingConfirming ||
      widget.outcome is PendingRejecting;

  @override
  void initState() {
    super.initState();
    _syncTimer();
  }

  @override
  void didUpdateWidget(PendingCard oldWidget) {
    super.didUpdateWidget(oldWidget);
    _syncTimer();
  }

  @override
  void dispose() {
    _timer?.cancel();
    super.dispose();
  }

  // Ticks only while the countdown is visible; stops once it expired.
  void _syncTimer() {
    final expired = isExpired(widget.pending.expiresAt, widget.clock());
    if (_answerable && !expired) {
      _timer ??= Timer.periodic(const Duration(seconds: 1), (_) {
        if (!mounted) return;
        setState(() {});
        if (isExpired(widget.pending.expiresAt, widget.clock())) {
          _timer?.cancel();
          _timer = null;
        }
      });
    } else {
      _timer?.cancel();
      _timer = null;
    }
  }

  @override
  Widget build(BuildContext context) {
    final textTheme = Theme.of(context).textTheme;
    final muted = textTheme.bodySmall?.copyWith(color: AppColors.textSecondary);
    final now = widget.clock();
    final outcome = widget.outcome;

    if (outcome is PendingDone) {
      return AssistantSection(
        key: const ValueKey('pending-card'),
        title: 'Đã thực hiện',
        icon: Icons.check_circle_outline,
        iconColor: AppColors.success,
        child: StepResults(
          results: outcome.results,
          now: now,
          emptyText: 'Đã xác nhận.',
        ),
      );
    }
    if (outcome is PendingRejected) {
      return AssistantSection(
        key: const ValueKey('pending-card'),
        title: 'Đã từ chối',
        icon: Icons.cancel_outlined,
        iconColor: AppColors.textSecondary,
        child: Padding(
          padding: const EdgeInsets.fromLTRB(12, 4, 12, 10),
          child: Text(
            'Đã huỷ yêu cầu. Mình không thực hiện gì cả.',
            style: muted,
          ),
        ),
      );
    }
    if (outcome is PendingStale) {
      return AssistantSection(
        key: const ValueKey('pending-card'),
        title: 'Không còn hiệu lực',
        icon: Icons.cancel_outlined,
        iconColor: AppColors.warning,
        child: Padding(
          padding: const EdgeInsets.fromLTRB(12, 4, 12, 10),
          child: Text(outcome.message, style: textTheme.bodySmall),
        ),
      );
    }

    final expired = isExpired(widget.pending.expiresAt, now);
    final working = outcome is PendingConfirming || outcome is PendingRejecting;
    final locked = expired || working;
    final clock = countdownClock(widget.pending.expiresAt, now);

    return AssistantSection(
      key: const ValueKey('pending-card'),
      title: 'Cần xác nhận',
      icon: Icons.help_outline,
      highlight: true,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          for (final step in widget.pending.steps)
            CheckboxListTile(
              key: ValueKey('pending-step-${step.index}'),
              value: _selected.contains(step.index),
              onChanged: locked
                  ? null
                  : (checked) => setState(() {
                      if (checked ?? false) {
                        _selected.add(step.index);
                      } else {
                        _selected.remove(step.index);
                      }
                    }),
              dense: true,
              controlAffinity: ListTileControlAffinity.leading,
              contentPadding: const EdgeInsets.symmetric(horizontal: 8),
              title: Text.rich(
                TextSpan(
                  children: [
                    TextSpan(
                      text: step.actionLabel,
                      style: const TextStyle(fontWeight: FontWeight.w600),
                    ),
                    if (step.roomName != null)
                      TextSpan(
                        text: ' · ${step.roomName}',
                        style: const TextStyle(color: AppColors.textSecondary),
                      ),
                  ],
                ),
              ),
              subtitle: Text(
                step.runAt == null
                    ? 'Thực hiện ngay khi xác nhận'
                    : 'Hẹn ${formatRunAt(step.runAt!, widget.timezone, now)}',
              ),
            ),
          Padding(
            padding: const EdgeInsets.fromLTRB(12, 0, 12, 0),
            child: expired
                ? Text(
                    _expiredText,
                    style: muted?.copyWith(
                      color: AppColors.warning,
                      fontWeight: FontWeight.w600,
                    ),
                  )
                : Text('Hết hạn sau ${clock ?? '0:00'}', style: muted),
          ),
          if (outcome is PendingOpen && outcome.error != null)
            Padding(
              padding: const EdgeInsets.fromLTRB(12, 4, 12, 0),
              child: Text(
                outcome.error!,
                style: textTheme.bodySmall?.copyWith(color: AppColors.critical),
              ),
            ),
          Padding(
            padding: const EdgeInsets.fromLTRB(12, 6, 12, 10),
            child: Row(
              mainAxisAlignment: MainAxisAlignment.end,
              children: [
                OutlinedButton(
                  key: const ValueKey('pending-reject'),
                  onPressed: locked ? null : widget.onReject,
                  child: outcome is PendingRejecting
                      ? const _Spinner()
                      : const Text('Từ chối'),
                ),
                const SizedBox(width: 8),
                FilledButton(
                  key: const ValueKey('pending-confirm'),
                  onPressed: locked || _selected.isEmpty
                      ? null
                      : () => widget.onConfirm(_selected.toList()..sort()),
                  child: outcome is PendingConfirming
                      ? const _Spinner(light: true)
                      : const Text('Xác nhận'),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

class _Spinner extends StatelessWidget {
  const _Spinner({this.light = false});

  final bool light;

  @override
  Widget build(BuildContext context) {
    return SizedBox(
      width: 16,
      height: 16,
      child: CircularProgressIndicator(
        strokeWidth: 2,
        color: light ? Colors.white : null,
      ),
    );
  }
}
