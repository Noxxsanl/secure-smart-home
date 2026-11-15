import 'package:flutter/foundation.dart';

import 'assistant_schedule.dart';

/// `type` of an AI Agent reply (docs/API_DESIGN.md, `AgentReply`).
enum AgentReplyType {
  answer,
  done,
  scheduled,
  confirm,
  mixed,
  clarify,
  refuse;

  /// Unknown values fall back to [answer] (a plain text reply).
  static AgentReplyType fromApi(String? value) {
    for (final type in values) {
      if (type.name == value) return type;
    }
    return answer;
  }
}

/// A question the Assistant asks back, with tappable options.
@immutable
class AgentClarification {
  const AgentClarification({required this.question, this.options = const []});

  final String question;
  final List<String> options;
}

/// One step waiting for the user's confirmation. [runAt] `null` = runs
/// immediately once confirmed.
@immutable
class AgentPendingStep {
  const AgentPendingStep({
    required this.index,
    required this.deviceId,
    required this.deviceName,
    required this.actionLabel,
    this.roomName,
    this.runAt,
    this.reason = '',
  });

  final int index;
  final int deviceId;
  final String deviceName;
  final String? roomName;
  final String actionLabel;
  final DateTime? runAt;
  final String reason;
}

/// The "Cần xác nhận" card: [requestHash] must be sent back verbatim.
@immutable
class AgentPending {
  const AgentPending({
    required this.requestId,
    required this.requestHash,
    required this.expiresAt,
    required this.steps,
  });

  final int requestId;
  final String requestHash;
  final DateTime expiresAt;
  final List<AgentPendingStep> steps;
}

/// A step the Assistant could not do; [message] is the agent's Vietnamese
/// sentence (absent when the backend answered directly).
@immutable
class AgentRejectedStep {
  const AgentRejectedStep({
    required this.index,
    required this.code,
    this.message,
  });

  final int index;
  final String code;
  final String? message;
}

@immutable
class AgentReply {
  const AgentReply({
    required this.conversationId,
    required this.type,
    required this.reply,
    this.transcript,
    this.clarification,
    this.executed = const [],
    this.scheduled = const [],
    this.pending,
    this.rejected = const [],
  });

  final String conversationId;
  final AgentReplyType type;
  final String reply;

  /// What the speech recognition heard; `null` for typed messages.
  final String? transcript;
  final AgentClarification? clarification;

  /// Clear commands the backend already ran, with each step's outcome.
  final List<AssistantSchedule> executed;

  /// Schedules the Assistant created from an explicit time.
  final List<AssistantSchedule> scheduled;
  final AgentPending? pending;
  final List<AgentRejectedStep> rejected;
}

/// `POST /agent/requests/:id/confirm` result: one schedule per chosen step.
@immutable
class AgentConfirmResult {
  const AgentConfirmResult({required this.requestId, required this.results});

  final int requestId;
  final List<AssistantSchedule> results;
}
