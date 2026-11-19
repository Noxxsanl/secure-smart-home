import '../../../core/utils/home_time.dart';
import '../../../core/utils/json.dart';
import '../domain/agent_reply.dart';
import '../domain/assistant_schedule.dart';

/// `Schedule` JSON → the fields the Assistant shows.
AssistantSchedule assistantScheduleFromJson(Json json) => AssistantSchedule(
  id: json.readInt('id'),
  deviceName: json.readStringOrNull('device_name'),
  roomName: json.readStringOrNull('room_name'),
  actionLabel: json.readString('action_label'),
  runAt: json.readDateOrNull('run_at') ?? DateTime.now().toUtc(),
  status: AssistantScheduleStatus.fromApi(json.readStringOrNull('status')),
  errorCode: json.readStringOrNull('error_code'),
  canCancel: json.readBool('can_cancel'),
  timezone: json.readString('timezone', fallback: defaultHomeTimezone),
);

List<AssistantSchedule> _schedules(Json json, String key) => [
  for (final item in json.readObjectList(key)) assistantScheduleFromJson(item),
];

AgentPendingStep _stepFromJson(Json json) => AgentPendingStep(
  index: json.readInt('index'),
  deviceId: json.readInt('device_id'),
  deviceName: json.readString('device_name'),
  roomName: json.readStringOrNull('room_name'),
  actionLabel: json.readString('action_label'),
  runAt: json.readDateOrNull('run_at'),
  reason: json.readString('reason'),
);

AgentPending agentPendingFromJson(Json json) => AgentPending(
  requestId: json.readInt('request_id'),
  requestHash: json.readString('request_hash'),
  expiresAt:
      json.readDateOrNull('expires_at') ??
      DateTime.now().toUtc().add(const Duration(minutes: 5)),
  steps: [for (final step in json.readObjectList('steps')) _stepFromJson(step)],
);

AgentRejectedStep _rejectedFromJson(Json json) => AgentRejectedStep(
  index: json.readIntOrNull('index') ?? 0,
  code: json.readString('code', fallback: 'UNKNOWN'),
  message: json.readStringOrNull('message'),
);

AgentClarification? _clarificationFromJson(Json? json) {
  if (json == null) return null;
  final options = json['options'];
  return AgentClarification(
    question: json.readString('question'),
    options: [
      if (options is List)
        for (final option in options)
          if (option is String && option.trim().isNotEmpty) option.trim(),
    ],
  );
}

/// `AgentReply` JSON. The agent may drop empty fields, so every list/object
/// defaults to empty/`null`.
AgentReply agentReplyFromJson(Json json) {
  final pending = json.readObjectOrNull('pending');
  return AgentReply(
    conversationId: json.readString('conversation_id'),
    type: AgentReplyType.fromApi(json.readStringOrNull('type')),
    reply: json.readString('reply'),
    transcript: json.readStringOrNull('transcript'),
    clarification: _clarificationFromJson(
      json.readObjectOrNull('clarification'),
    ),
    executed: _schedules(json, 'executed'),
    scheduled: _schedules(json, 'scheduled'),
    pending: pending == null ? null : agentPendingFromJson(pending),
    rejected: [
      for (final step in json.readObjectList('rejected'))
        _rejectedFromJson(step),
    ],
  );
}

AgentConfirmResult agentConfirmResultFromJson(Json json) => AgentConfirmResult(
  requestId: json.readInt('request_id'),
  results: _schedules(json, 'results'),
);
