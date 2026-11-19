import 'package:flutter/foundation.dart';

import 'agent_reply.dart';
import 'assistant_schedule.dart';

/// A finished voice recording, ready to upload.
@immutable
class RecordedAudio {
  const RecordedAudio({
    required this.bytes,
    required this.mimeType,
    required this.durationMs,
  });

  /// The whole encoded file (a WAV container, kept in memory only).
  final Uint8List bytes;
  final String mimeType;
  final int durationMs;
}

/// Talks to the AI Agent (`/homes/:id/messages|voice`) and, for confirmations
/// and cancellations, to the backend on the mobile channel.
abstract interface class AssistantRepository {
  /// Typed message (1..500 characters).
  Future<AgentReply> sendText(
    int homeId,
    String text, {
    String? conversationId,
  });

  /// Voice message; the reply carries the `transcript`.
  Future<AgentReply> sendVoice(
    int homeId,
    RecordedAudio audio, {
    String? conversationId,
  });

  /// Confirms the chosen [stepIndexes] of a pending request. [requestHash] is
  /// sent back exactly as received.
  Future<AgentConfirmResult> confirm(
    int requestId,
    String requestHash,
    List<int> stepIndexes,
  );

  Future<void> reject(int requestId);

  /// Cancels a schedule the Assistant created (only while `scheduled`).
  Future<AssistantSchedule> cancelSchedule(int scheduleId);
}
