import '../../../core/network/api_client.dart';
import '../../../core/utils/json.dart';
import '../domain/automation_repository.dart';
import '../domain/automation_rule.dart';
import 'automation_mapper.dart';

/// Automation + AI suggestions (contract §4.2).
class RemoteAutomationRepository implements AutomationRepository {
  RemoteAutomationRepository(this._api);

  final ApiClient _api;

  @override
  Future<List<AutomationRule>> listRules(int homeId) async {
    final data = await _api.get('/homes/$homeId/automations');
    return asJsonList(data).map(ruleFromJson).toList();
  }

  @override
  Future<AutomationRule> createRule(int homeId, RuleDraft draft) async {
    final data = await _api.post(
      '/homes/$homeId/automations',
      body: ruleDraftToJson(draft),
    );
    return ruleFromJson(asJson(data));
  }

  @override
  Future<AutomationRule> setEnabled(int ruleId, bool enabled) async {
    final data = await _api.patch(
      '/automations/$ruleId',
      body: {'enabled': enabled},
    );
    return ruleFromJson(asJson(data));
  }

  @override
  Future<void> deleteRule(int ruleId) async {
    await _api.delete('/automations/$ruleId');
  }

  @override
  Future<List<RuleRun>> history(int ruleId, {int limit = 20}) async {
    final data = await _api.get(
      '/automations/$ruleId/history',
      query: {'limit': limit},
    );
    return asJsonList(data).map(ruleRunFromJson).toList();
  }

  @override
  Future<List<HabitSuggestion>> listSuggestions(int homeId) async {
    final data = await _api.get('/homes/$homeId/suggestions');
    return asJsonList(data).map(suggestionFromJson).toList();
  }

  @override
  Future<AcceptedSuggestion> acceptSuggestion(int suggestionId) async {
    final data = await _api.post('/suggestions/$suggestionId/accept');
    return acceptedSuggestionFromJson(asJson(data));
  }

  @override
  Future<HabitSuggestion> dismissSuggestion(int suggestionId) async {
    final data = await _api.post('/suggestions/$suggestionId/dismiss');
    return suggestionFromJson(asJson(asJson(data).readObject('suggestion')));
  }
}
