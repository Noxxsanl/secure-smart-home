import 'package:flutter/foundation.dart';

enum TriggerType {
  sensorThreshold('sensor_threshold', 'Theo cảm biến'),
  schedule('schedule', 'Theo lịch');

  const TriggerType(this.apiValue, this.label);

  final String apiValue;
  final String label;

  static TriggerType fromApi(String? value) =>
      value == 'schedule' ? TriggerType.schedule : TriggerType.sensorThreshold;
}

enum TriggerMetric {
  temperature('temperature', 'Nhiệt độ', 'nhiệt độ', '°C'),
  humidity('humidity', 'Độ ẩm', 'độ ẩm', '%');

  const TriggerMetric(this.apiValue, this.label, this.noun, this.unit);

  final String apiValue;
  final String label;

  /// Lower-case form used inside sentences.
  final String noun;
  final String unit;

  static TriggerMetric? fromApi(String? value) {
    for (final metric in values) {
      if (metric.apiValue == value) return metric;
    }
    return null;
  }
}

enum TriggerOperator {
  greater('>', 'Lớn hơn', 'cao hơn'),
  less('<', 'Nhỏ hơn', 'thấp hơn'),
  equal('=', 'Bằng', 'bằng');

  const TriggerOperator(this.symbol, this.label, this.phrase);

  /// The value the API uses.
  final String symbol;
  final String label;

  /// Used inside sentences: "cao hơn 30°C".
  final String phrase;

  static TriggerOperator? fromApi(String? value) {
    for (final operator in values) {
      if (operator.symbol == value) return operator;
    }
    return null;
  }
}

enum RuleAction {
  turnOn('turn_on', 'Bật', 'bật'),
  turnOff('turn_off', 'Tắt', 'tắt');

  const RuleAction(this.apiValue, this.label, this.verb);

  final String apiValue;
  final String label;

  /// Lower-case verb used inside sentences.
  final String verb;

  static RuleAction fromApi(String? value) =>
      value == 'turn_on' ? RuleAction.turnOn : RuleAction.turnOff;
}

enum RuleOrigin {
  user,
  aiSuggested;

  static RuleOrigin fromApi(String? value) =>
      value == 'ai_suggested' ? RuleOrigin.aiSuggested : RuleOrigin.user;
}

/// Contract §3 `AutomationRule`.
@immutable
class AutomationRule {
  const AutomationRule({
    required this.id,
    required this.homeId,
    required this.name,
    required this.enabled,
    required this.triggerType,
    required this.actionCommand,
    required this.origin,
    required this.canEdit,
    required this.canDelete,
    this.homeName,
    this.triggerRoomId,
    this.triggerRoomName,
    this.triggerMetric,
    this.triggerOperator,
    this.triggerThreshold,
    this.scheduleTime,
    this.scheduleDays,
    this.actionDeviceId,
    this.actionDeviceName,
    this.createdByUserId,
    this.createdByName,
    this.lastTriggeredAt,
    this.createdAt,
  });

  final int id;
  final int homeId;
  final String? homeName;
  final String name;
  final bool enabled;
  final TriggerType triggerType;
  final int? triggerRoomId;
  final String? triggerRoomName;
  final TriggerMetric? triggerMetric;
  final TriggerOperator? triggerOperator;
  final double? triggerThreshold;

  /// `HH:MM`.
  final String? scheduleTime;

  /// ISO weekdays, 1 = Monday … 7 = Sunday.
  final List<int>? scheduleDays;
  final int? actionDeviceId;
  final String? actionDeviceName;
  final RuleAction actionCommand;
  final RuleOrigin origin;
  final int? createdByUserId;
  final String? createdByName;
  final DateTime? lastTriggeredAt;
  final DateTime? createdAt;

  /// Whether the caller may toggle/edit this rule (OWNER any, CONTROLLER own).
  final bool canEdit;
  final bool canDelete;

  AutomationRule copyWith({
    bool? enabled,
    bool? canEdit,
    bool? canDelete,
    DateTime? lastTriggeredAt,
  }) => AutomationRule(
    id: id,
    homeId: homeId,
    homeName: homeName,
    name: name,
    enabled: enabled ?? this.enabled,
    triggerType: triggerType,
    triggerRoomId: triggerRoomId,
    triggerRoomName: triggerRoomName,
    triggerMetric: triggerMetric,
    triggerOperator: triggerOperator,
    triggerThreshold: triggerThreshold,
    scheduleTime: scheduleTime,
    scheduleDays: scheduleDays,
    actionDeviceId: actionDeviceId,
    actionDeviceName: actionDeviceName,
    actionCommand: actionCommand,
    origin: origin,
    createdByUserId: createdByUserId,
    createdByName: createdByName,
    lastTriggeredAt: lastTriggeredAt ?? this.lastTriggeredAt,
    createdAt: createdAt,
    canEdit: canEdit ?? this.canEdit,
    canDelete: canDelete ?? this.canDelete,
  );
}

/// What the user fills in on the "Tạo quy tắc" screen.
@immutable
class RuleDraft {
  const RuleDraft({
    required this.name,
    required this.triggerType,
    required this.actionDeviceId,
    required this.actionCommand,
    this.triggerRoomId,
    this.triggerMetric,
    this.triggerOperator,
    this.triggerThreshold,
    this.scheduleTime,
    this.scheduleDays,
  });

  final String name;
  final TriggerType triggerType;
  final int actionDeviceId;
  final RuleAction actionCommand;
  final int? triggerRoomId;
  final TriggerMetric? triggerMetric;
  final TriggerOperator? triggerOperator;
  final double? triggerThreshold;
  final String? scheduleTime;
  final List<int>? scheduleDays;
}

enum SuggestionStatus {
  pending,
  accepted,
  dismissed;

  static SuggestionStatus fromApi(String? value) {
    for (final status in values) {
      if (status.name == value) return status;
    }
    return SuggestionStatus.pending;
  }
}

/// Contract §3 `HabitSuggestion` (FR-7.4 – 7.6).
@immutable
class HabitSuggestion {
  const HabitSuggestion({
    required this.id,
    required this.homeId,
    required this.deviceId,
    required this.deviceName,
    required this.action,
    required this.timeOfDay,
    required this.daysMatched,
    required this.windowDays,
    required this.status,
    this.roomName,
    this.createdAt,
    this.respondedAt,
    this.ruleId,
  });

  final int id;
  final int homeId;
  final int deviceId;
  final String deviceName;
  final String? roomName;
  final RuleAction action;

  /// `HH:MM`.
  final String timeOfDay;
  final int daysMatched;
  final int windowDays;
  final SuggestionStatus status;
  final DateTime? createdAt;
  final DateTime? respondedAt;
  final int? ruleId;

  bool get isPending => status == SuggestionStatus.pending;

  HabitSuggestion copyWith({
    SuggestionStatus? status,
    DateTime? respondedAt,
    int? ruleId,
  }) => HabitSuggestion(
    id: id,
    homeId: homeId,
    deviceId: deviceId,
    deviceName: deviceName,
    roomName: roomName,
    action: action,
    timeOfDay: timeOfDay,
    daysMatched: daysMatched,
    windowDays: windowDays,
    status: status ?? this.status,
    createdAt: createdAt,
    respondedAt: respondedAt ?? this.respondedAt,
    ruleId: ruleId ?? this.ruleId,
  );
}

/// Response of `POST /suggestions/:id/accept` — accepting creates a rule
/// (FR-7.5: nothing runs from a suggestion that is not accepted).
@immutable
class AcceptedSuggestion {
  const AcceptedSuggestion({required this.suggestion, required this.rule});

  final HabitSuggestion suggestion;
  final AutomationRule rule;
}

enum RunResult {
  success('Thành công'),
  failed('Thất bại'),
  skipped('Bỏ qua');

  const RunResult(this.label);

  final String label;

  static RunResult fromApi(String? value) {
    for (final result in values) {
      if (result.name == value) return result;
    }
    return RunResult.skipped;
  }
}

/// One entry of `GET /automations/:id/history`.
@immutable
class RuleRun {
  const RuleRun({
    required this.id,
    required this.triggeredAt,
    required this.result,
    this.details,
  });

  final int id;
  final DateTime triggeredAt;
  final RunResult result;
  final Map<String, dynamic>? details;

  /// A short explanation taken from `details.message` / `details.reason`.
  String? get note {
    final data = details;
    if (data == null) return null;
    for (final key in const ['message', 'reason', 'error']) {
      final value = data[key];
      if (value is String && value.trim().isNotEmpty) return value.trim();
    }
    return null;
  }
}
