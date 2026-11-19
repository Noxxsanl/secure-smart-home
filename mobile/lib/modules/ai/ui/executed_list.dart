import 'package:flutter/material.dart';

import '../../../core/theme/app_theme.dart';
import '../domain/assistant_schedule.dart';
import 'assistant_section.dart';
import 'step_results.dart';

/// "Đã làm": clear commands the backend already ran, with each step's result.
/// When no step worked (offline device, lost permission…) the title becomes
/// "Chưa thực hiện được" so it does not mislead.
class ExecutedList extends StatelessWidget {
  const ExecutedList({super.key, required this.executed, required this.now});

  final List<AssistantSchedule> executed;
  final DateTime now;

  @override
  Widget build(BuildContext context) {
    if (executed.isEmpty) return const SizedBox.shrink();
    final anyOk = executed.any((s) => s.status.isSettledOk);
    return AssistantSection(
      key: const ValueKey('assistant-executed'),
      title: anyOk ? 'Đã làm' : 'Chưa thực hiện được',
      icon: anyOk ? Icons.check_circle_outline : Icons.warning_amber_rounded,
      iconColor: anyOk ? AppColors.success : AppColors.critical,
      child: StepResults(results: executed, now: now),
    );
  }
}
