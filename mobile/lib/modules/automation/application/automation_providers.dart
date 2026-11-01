import 'dart:async';

import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/config/app_config.dart';
import '../../../core/network/api_exception.dart';
import '../../../core/network/network_providers.dart';
import '../../../mock/mock_providers.dart';
import '../../auth/auth.dart';
import '../../homes/homes.dart';
import '../data/automation_mock_repository.dart';
import '../data/automation_remote_repository.dart';
import '../domain/automation_repository.dart';
import '../domain/automation_rule.dart';

final automationRepositoryProvider = Provider<AutomationRepository>((ref) {
  final config = ref.watch(appConfigProvider);
  if (config.useMock) {
    return MockAutomationRepository(ref.watch(mockBackendProvider));
  }
  return RemoteAutomationRepository(ref.watch(apiClientProvider));
});

/// Rules of one home (FR-7.1). GUEST callers receive `403`, which the screen
/// turns into an explanation.
class AutomationRulesNotifier extends AsyncNotifier<List<AutomationRule>> {
  AutomationRulesNotifier(this.homeId);

  final int homeId;

  @override
  Future<List<AutomationRule>> build() {
    final userId = ref.watch(sessionUserIdProvider);
    final repository = ref.watch(automationRepositoryProvider);
    if (userId == null) {
      return Future<List<AutomationRule>>.error(
        const ApiException(code: ApiErrorCode.sessionExpired),
      );
    }
    return repository.listRules(homeId);
  }

  Future<void> refresh({bool throwOnError = false}) async {
    try {
      final rules = await ref.read(automationRepositoryProvider).listRules(homeId);
      if (!ref.mounted) return;
      state = AsyncData(rules);
    } on Object {
      if (throwOnError) rethrow;
    }
  }

  Future<void> create(RuleDraft draft) async {
    final rule = await ref
        .read(automationRepositoryProvider)
        .createRule(homeId, draft);
    if (!ref.mounted) return;
    state = AsyncData([...state.value ?? const [], rule]);
  }

  /// Optimistic switch; reverts on failure.
  Future<void> setEnabled(int ruleId, bool enabled) async {
    final before = state.value;
    if (before == null) return;
    state = AsyncData([
      for (final rule in before)
        rule.id == ruleId ? rule.copyWith(enabled: enabled) : rule,
    ]);
    try {
      final saved = await ref
          .read(automationRepositoryProvider)
          .setEnabled(ruleId, enabled);
      if (!ref.mounted) return;
      state = AsyncData([
        for (final rule in state.value ?? before)
          rule.id == ruleId ? saved : rule,
      ]);
    } on Object {
      if (ref.mounted) state = AsyncData(before);
      rethrow;
    }
  }

  Future<void> delete(int ruleId) async {
    await ref.read(automationRepositoryProvider).deleteRule(ruleId);
    if (!ref.mounted) return;
    state = AsyncData([
      for (final rule in state.value ?? const <AutomationRule>[])
        if (rule.id != ruleId) rule,
    ]);
  }
}

final automationRulesProvider = AsyncNotifierProvider.autoDispose
    .family<AutomationRulesNotifier, List<AutomationRule>, int>(
      AutomationRulesNotifier.new,
    );

/// AI habit suggestions of one home (FR-7.5). They only ever turn into a rule
/// when the user accepts; nothing runs from a pending suggestion.
class SuggestionsNotifier extends AsyncNotifier<List<HabitSuggestion>> {
  SuggestionsNotifier(this.homeId);

  final int homeId;

  @override
  Future<List<HabitSuggestion>> build() async {
    final userId = ref.watch(sessionUserIdProvider);
    final repository = ref.watch(automationRepositoryProvider);
    final role = ref.watch(
      homesProvider.select((homes) => homes.value?.byId(homeId)?.role),
    );
    if (userId == null || role == null || !role.canViewAutomation) {
      return const [];
    }
    return repository.listSuggestions(homeId);
  }

  Future<void> refresh({bool throwOnError = false}) async {
    try {
      final items = await ref
          .read(automationRepositoryProvider)
          .listSuggestions(homeId);
      if (!ref.mounted) return;
      state = AsyncData(items);
      _syncPendingCount(items);
    } on Object {
      if (throwOnError) rethrow;
    }
  }

  void _syncPendingCount(List<HabitSuggestion> items) {
    if (!ref.exists(homeOverviewProvider(homeId))) return;
    ref
        .read(homeOverviewProvider(homeId).notifier)
        .setPendingSuggestions(items.where((s) => s.isPending).length);
  }

  /// Creates a rule from the suggestion, then refreshes both lists.
  Future<void> accept(int suggestionId) async {
    await ref.read(automationRepositoryProvider).acceptSuggestion(suggestionId);
    if (!ref.mounted) return;
    ref.invalidate(automationRulesProvider(homeId));
    await refresh();
  }

  Future<void> dismiss(int suggestionId) async {
    await ref
        .read(automationRepositoryProvider)
        .dismissSuggestion(suggestionId);
    if (!ref.mounted) return;
    await refresh();
  }
}

final suggestionsProvider = AsyncNotifierProvider.autoDispose
    .family<SuggestionsNotifier, List<HabitSuggestion>, int>(
      SuggestionsNotifier.new,
    );

/// `GET /automations/:id/history` (FR-7.2).
final ruleHistoryProvider = FutureProvider.autoDispose
    .family<List<RuleRun>, int>((ref, ruleId) {
      ref.watch(sessionUserIdProvider);
      return ref.watch(automationRepositoryProvider).history(ruleId);
    });
