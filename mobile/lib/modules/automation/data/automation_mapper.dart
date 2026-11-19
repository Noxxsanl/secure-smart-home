import '../../../core/utils/json.dart';
import '../domain/automation_rule.dart';

/// Contract §3 `AutomationRule`.
AutomationRule ruleFromJson(Json json) => AutomationRule(
  id: json.readInt('id'),
  homeId: json.readIntOrNull('home_id') ?? 0,
  homeName: json.readStringOrNull('home_name'),
  name: json.readString('name', fallback: 'Quy tắc'),
  enabled: json.readBool('enabled'),
  triggerType: TriggerType.fromApi(json.readStringOrNull('trigger_type')),
  triggerRoomId: json.readIntOrNull('trigger_room_id'),
  triggerRoomName: json.readStringOrNull('trigger_room_name'),
  triggerMetric: TriggerMetric.fromApi(json.readStringOrNull('trigger_metric')),
  triggerOperator: TriggerOperator.fromApi(
    json.readStringOrNull('trigger_operator'),
  ),
  triggerThreshold: json.readDoubleOrNull('trigger_threshold'),
  scheduleTime: json.readStringOrNull('schedule_time'),
  scheduleDays: json['schedule_days'] == null
      ? null
      : json.readIntList('schedule_days'),
  actionDeviceId: json.readIntOrNull('action_device_id'),
  actionDeviceName: json.readStringOrNull('action_device_name'),
  actionCommand: RuleAction.fromApi(json.readStringOrNull('action_command')),
  origin: RuleOrigin.fromApi(json.readStringOrNull('origin')),
  createdByUserId: json.readIntOrNull('created_by_user_id'),
  createdByName: json.readStringOrNull('created_by_name'),
  lastTriggeredAt: json.readDateOrNull('last_triggered_at'),
  createdAt: json.readDateOrNull('created_at'),
  canEdit: json.readBool('can_edit'),
  canDelete: json.readBool('can_delete'),
);

/// Contract §3 `HabitSuggestion`.
HabitSuggestion suggestionFromJson(Json json) => HabitSuggestion(
  id: json.readInt('id'),
  homeId: json.readIntOrNull('home_id') ?? 0,
  deviceId: json.readIntOrNull('device_id') ?? 0,
  deviceName: json.readString('device_name', fallback: 'Thiết bị'),
  roomName: json.readStringOrNull('room_name'),
  action: RuleAction.fromApi(json.readStringOrNull('action')),
  timeOfDay: json.readString('time_of_day', fallback: '--:--'),
  daysMatched: json.readIntOrNull('days_matched') ?? 0,
  windowDays: json.readIntOrNull('window_days') ?? 7,
  status: SuggestionStatus.fromApi(json.readStringOrNull('status')),
  createdAt: json.readDateOrNull('created_at'),
  respondedAt: json.readDateOrNull('responded_at'),
  ruleId: json.readIntOrNull('rule_id'),
);

/// `POST /suggestions/:id/accept` response: `{ suggestion, rule }`.
AcceptedSuggestion acceptedSuggestionFromJson(Json json) => AcceptedSuggestion(
  suggestion: suggestionFromJson(json.readObject('suggestion')),
  rule: ruleFromJson(json.readObject('rule')),
);

/// `GET /automations/:id/history` item.
RuleRun ruleRunFromJson(Json json) {
  final details = json['details'];
  return RuleRun(
    id: json.readIntOrNull('id') ?? 0,
    triggeredAt: json.readDateOrNull('triggered_at') ?? DateTime.now(),
    result: RunResult.fromApi(json.readStringOrNull('result')),
    details: details is Map ? asJson(details) : null,
  );
}

/// Body for `POST /homes/:homeId/automations` (only the fields of the chosen
/// trigger type are sent).
Map<String, Object?> ruleDraftToJson(RuleDraft draft) => {
  'name': draft.name.trim(),
  'trigger_type': draft.triggerType.apiValue,
  'action_device_id': draft.actionDeviceId,
  'action_command': draft.actionCommand.apiValue,
  if (draft.triggerType == TriggerType.sensorThreshold) ...{
    'trigger_room_id': draft.triggerRoomId,
    'trigger_metric': draft.triggerMetric?.apiValue,
    'trigger_operator': draft.triggerOperator?.symbol,
    'trigger_threshold': draft.triggerThreshold,
  } else ...{
    'schedule_time': draft.scheduleTime,
    'schedule_days': draft.scheduleDays,
  },
};
