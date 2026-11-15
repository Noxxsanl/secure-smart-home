import 'package:flutter/foundation.dart';

import 'agent_reply.dart';
import 'assistant_schedule.dart';

/// State of the "Cần xác nhận" card.
sealed class PendingOutcome {
  const PendingOutcome();
}

/// Waiting for the user. [error] = a transient failure (offline…): the card
/// can still be used again.
final class PendingOpen extends PendingOutcome {
  const PendingOpen({this.error});

  final String? error;
}

final class PendingConfirming extends PendingOutcome {
  const PendingConfirming();
}

final class PendingRejecting extends PendingOutcome {
  const PendingRejecting();
}

final class PendingDone extends PendingOutcome {
  const PendingDone(this.results);

  final List<AssistantSchedule> results;
}

final class PendingRejected extends PendingOutcome {
  const PendingRejected();
}

/// Handled elsewhere / expired / steps changed — the card is locked and
/// [message] explains why.
final class PendingStale extends PendingOutcome {
  const PendingStale(this.message);

  final String message;
}

/// One row of the conversation.
@immutable
sealed class ChatEntry {
  const ChatEntry(this.id);

  final int id;
}

/// What the user said or typed. [text] `null` while a voice message is still
/// being recognised.
final class UserEntry extends ChatEntry {
  const UserEntry({required int id, this.text, this.voice = false}) : super(id);

  final String? text;
  final bool voice;

  UserEntry withText(String? value) =>
      UserEntry(id: id, text: value, voice: voice);
}

final class AssistantEntry extends ChatEntry {
  const AssistantEntry({
    required int id,
    required this.reply,
    required this.scheduled,
    this.outcome,
  }) : super(id);

  final AgentReply reply;

  /// `reply.scheduled`, kept apart so a cancel can update one row.
  final List<AssistantSchedule> scheduled;

  /// Only for replies that carry a `pending` card.
  final PendingOutcome? outcome;

  AssistantEntry copyWith({
    List<AssistantSchedule>? scheduled,
    PendingOutcome? outcome,
  }) => AssistantEntry(
    id: id,
    reply: reply,
    scheduled: scheduled ?? this.scheduled,
    outcome: outcome ?? this.outcome,
  );
}

final class ErrorEntry extends ChatEntry {
  const ErrorEntry({required int id, required this.text}) : super(id);

  final String text;
}
