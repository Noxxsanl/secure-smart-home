import '../../../core/network/api_exception.dart';
import '../../../mock/mock_backend.dart';
import '../../devices/devices.dart';
import '../../homes/homes.dart';
import '../domain/automation_repository.dart';
import '../domain/automation_rule.dart';

/// Automation + suggestions with the contract's permission matrix: GUEST gets
/// 403 everywhere, VIEWER is read-only, CONTROLLER edits only own rules,
/// accepting a suggestion creates a rule (FR-7.5).
class MockAutomationRepository implements AutomationRepository {
  MockAutomationRepository(this._backend);

  final MockBackend _backend;

  static final _timePattern = RegExp(r'^([01]\d|2[0-3]):[0-5]\d$');

  MockMembership _viewer(int homeId) {
    final membership = _backend.requireMembership(homeId);
    if (!membership.role.canViewAutomation) _backend.forbidden();
    return membership;
  }

  MockMembership _editor(int homeId) {
    final membership = _viewer(homeId);
    if (!membership.role.canEditAutomation) _backend.forbidden();
    _backend.requireWritable(homeId);
    return membership;
  }

  AutomationRule _view(AutomationRule rule, MockMembership membership) {
    final own = rule.createdByUserId == _backend.meId;
    final canEdit =
        membership.role == HomeRole.owner ||
        (membership.role == HomeRole.controller && own);
    return rule.copyWith(canEdit: canEdit, canDelete: canEdit);
  }

  AutomationRule _rule(int ruleId) {
    for (final rule in _backend.rules) {
      if (rule.id == ruleId) return rule;
    }
    _backend.notFound();
  }

  void _store(AutomationRule rule) {
    final index = _backend.rules.indexWhere((r) => r.id == rule.id);
    if (index >= 0) {
      _backend.rules[index] = rule;
    } else {
      _backend.rules.add(rule);
    }
  }

  @override
  Future<List<AutomationRule>> listRules(int homeId) {
    return _backend.respond(() {
      final membership = _viewer(homeId);
      return [
        for (final rule in _backend.rules.where((r) => r.homeId == homeId))
          _view(rule, membership),
      ];
    });
  }

  @override
  Future<AutomationRule> createRule(int homeId, RuleDraft draft) {
    return _backend.respond(() {
      final membership = _editor(homeId);
      final name = draft.name.trim();
      if (name.isEmpty || name.length > 128) _backend.invalidInput();

      CustomerDevice? action;
      for (final d in _backend.devices) {
        if (d.id == draft.actionDeviceId && d.homeId == homeId && d.isRelay) {
          action = d;
        }
      }
      if (action == null) _backend.invalidInput();

      String? roomName;
      if (draft.triggerType == TriggerType.sensorThreshold) {
        final roomId = draft.triggerRoomId;
        final hasSensor = _backend.devices.any(
          (d) => d.homeId == homeId && d.roomId == roomId && d.isSensor,
        );
        if (roomId == null ||
            !hasSensor ||
            draft.triggerMetric == null ||
            draft.triggerOperator == null ||
            draft.triggerThreshold == null) {
          _backend.invalidInput();
        }
        roomName = _backend.requireRoom(roomId).name;
      } else {
        final days = draft.scheduleDays ?? const <int>[];
        if (draft.scheduleTime == null ||
            !_timePattern.hasMatch(draft.scheduleTime!) ||
            days.isEmpty ||
            days.any((d) => d < 1 || d > 7)) {
          _backend.invalidInput();
        }
      }

      final isThreshold = draft.triggerType == TriggerType.sensorThreshold;
      final rule = AutomationRule(
        id: _backend.nextId('rule'),
        homeId: homeId,
        homeName: _backend.homeRecord(homeId).home.name,
        name: name,
        enabled: true,
        triggerType: draft.triggerType,
        triggerRoomId: isThreshold ? draft.triggerRoomId : null,
        triggerRoomName: isThreshold ? roomName : null,
        triggerMetric: isThreshold ? draft.triggerMetric : null,
        triggerOperator: isThreshold ? draft.triggerOperator : null,
        triggerThreshold: isThreshold ? draft.triggerThreshold : null,
        scheduleTime: isThreshold ? null : draft.scheduleTime,
        scheduleDays: isThreshold ? null : ({...?draft.scheduleDays}.toList()..sort()),
        actionDeviceId: action.id,
        actionDeviceName: action.name,
        actionCommand: draft.actionCommand,
        origin: RuleOrigin.user,
        createdByUserId: _backend.meId,
        createdByName: _backend.me.fullName,
        createdAt: _backend.now,
        canEdit: true,
        canDelete: true,
      );
      _store(rule);
      return _view(rule, membership);
    });
  }

  @override
  Future<AutomationRule> setEnabled(int ruleId, bool enabled) {
    return _backend.respond(() {
      final rule = _rule(ruleId);
      final membership = _editor(rule.homeId);
      if (!_view(rule, membership).canEdit) _backend.forbidden();
      final next = rule.copyWith(enabled: enabled);
      _store(next);
      return _view(next, membership);
    });
  }

  @override
  Future<void> deleteRule(int ruleId) {
    return _backend.respond(() {
      final rule = _rule(ruleId);
      final membership = _editor(rule.homeId);
      if (!_view(rule, membership).canDelete) _backend.forbidden();
      _backend.rules.removeWhere((r) => r.id == ruleId);
      _backend.ruleRuns.remove(ruleId);
    });
  }

  @override
  Future<List<RuleRun>> history(int ruleId, {int limit = 20}) {
    return _backend.respond(() {
      final rule = _rule(ruleId);
      _viewer(rule.homeId);
      final runs = [...?_backend.ruleRuns[ruleId]]
        ..sort((a, b) => b.triggeredAt.compareTo(a.triggeredAt));
      return runs.take(limit).toList();
    });
  }

  @override
  Future<List<HabitSuggestion>> listSuggestions(int homeId) {
    return _backend.respond(() {
      _viewer(homeId);
      final cutoff = _backend.now.subtract(const Duration(days: 30));
      return [
        for (final s in _backend.suggestions)
          if (s.homeId == homeId &&
              (s.isPending || (s.respondedAt?.isAfter(cutoff) ?? false)))
            s,
      ]..sort(
        (a, b) => (b.createdAt ?? DateTime(2000)).compareTo(
          a.createdAt ?? DateTime(2000),
        ),
      );
    });
  }

  HabitSuggestion _suggestion(int id) {
    for (final s in _backend.suggestions) {
      if (s.id == id) return s;
    }
    _backend.notFound();
  }

  void _storeSuggestion(HabitSuggestion next) {
    final index = _backend.suggestions.indexWhere((s) => s.id == next.id);
    _backend.suggestions[index] = next;
  }

  @override
  Future<AcceptedSuggestion> acceptSuggestion(int suggestionId) {
    return _backend.respond(() {
      final suggestion = _suggestion(suggestionId);
      final membership = _editor(suggestion.homeId);
      if (!suggestion.isPending) {
        throw const ApiException(
          code: ApiErrorCode.alreadyResponded,
          statusCode: 409,
        );
      }
      final stamp = _backend.now;
      final rule = AutomationRule(
        id: _backend.nextId('rule'),
        homeId: suggestion.homeId,
        homeName: _backend.homeRecord(suggestion.homeId).home.name,
        name: '${suggestion.action.label} ${suggestion.deviceName} lúc ${suggestion.timeOfDay}',
        enabled: true,
        triggerType: TriggerType.schedule,
        scheduleTime: suggestion.timeOfDay,
        scheduleDays: const [1, 2, 3, 4, 5, 6, 7],
        actionDeviceId: suggestion.deviceId,
        actionDeviceName: suggestion.deviceName,
        actionCommand: suggestion.action,
        origin: RuleOrigin.aiSuggested,
        createdByUserId: _backend.meId,
        createdByName: _backend.me.fullName,
        createdAt: stamp,
        canEdit: true,
        canDelete: true,
      );
      _store(rule);
      final accepted = suggestion.copyWith(
        status: SuggestionStatus.accepted,
        respondedAt: stamp,
        ruleId: rule.id,
      );
      _storeSuggestion(accepted);
      return AcceptedSuggestion(
        suggestion: accepted,
        rule: _view(rule, membership),
      );
    });
  }

  @override
  Future<HabitSuggestion> dismissSuggestion(int suggestionId) {
    return _backend.respond(() {
      final suggestion = _suggestion(suggestionId);
      _editor(suggestion.homeId);
      if (!suggestion.isPending) {
        throw const ApiException(
          code: ApiErrorCode.alreadyResponded,
          statusCode: 409,
        );
      }
      final dismissed = suggestion.copyWith(
        status: SuggestionStatus.dismissed,
        respondedAt: _backend.now,
      );
      _storeSuggestion(dismissed);
      return dismissed;
    });
  }
}
