import 'automation_rule.dart';

/// Automation rules and AI suggestions (FR-7.1, 7.2, 7.5).
///
/// GUEST callers get `403` from every method (the UI explains why).
abstract class AutomationRepository {
  /// `GET /homes/:homeId/automations`.
  Future<List<AutomationRule>> listRules(int homeId);

  /// `POST /homes/:homeId/automations` (OWNER/CONTROLLER).
  Future<AutomationRule> createRule(int homeId, RuleDraft draft);

  /// `PATCH /automations/:ruleId { enabled }`.
  Future<AutomationRule> setEnabled(int ruleId, bool enabled);

  /// `DELETE /automations/:ruleId`.
  Future<void> deleteRule(int ruleId);

  /// `GET /automations/:ruleId/history?limit=20`.
  Future<List<RuleRun>> history(int ruleId, {int limit = 20});

  /// `GET /homes/:homeId/suggestions` (pending + last 30 days).
  Future<List<HabitSuggestion>> listSuggestions(int homeId);

  /// `POST /suggestions/:id/accept` — creates a rule (FR-7.5).
  Future<AcceptedSuggestion> acceptSuggestion(int suggestionId);

  /// `POST /suggestions/:id/dismiss`.
  Future<HabitSuggestion> dismissSuggestion(int suggestionId);
}
