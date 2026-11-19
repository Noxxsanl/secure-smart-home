import '../../../core/network/api_exception.dart';
import '../../../core/network/error_messages.dart';
import '../domain/agent_reply.dart';
import '../domain/assistant_texts.dart';
import '../domain/voice_recorder.dart';

/// Sentence for a failed call to the agent (typed or [voice] message). An
/// agent error code gets its own sentence; HTTP 413/429 (nginx answers 429
/// with HTML, no code) are told apart; transport and session errors go through
/// the shared table; anything else (5xx, an unknown code) is "tạm bận" — never
/// a raw code.
String assistantErrorMessage(Object error, {bool voice = false}) {
  final unwrapped = unwrapError(error);
  if (unwrapped is ApiException) {
    final known = agentErrorMessages[unwrapped.code];
    if (known != null) return known;
    final status = unwrapped.statusCode;
    if (status == 413) {
      return voice
          ? agentErrorMessages['AUDIO_TOO_LARGE']!
          : agentErrorMessages['MESSAGE_TOO_LARGE']!;
    }
    if (status == 429) return agentErrorMessages['RATE_LIMITED']!;
    if (status == null || status == 401) return userMessageFor(unwrapped);
    return assistantBusyMessage;
  }
  return userMessageFor(unwrapped);
}

/// Sentence for a failed confirm/reject of a pending request.
String confirmErrorMessage(Object error) =>
    userMessageFor(error, overrides: confirmErrorMessages);

/// Sentence for a failed cancel of a schedule the Assistant created.
String cancelErrorMessage(Object error) =>
    userMessageFor(error, overrides: cancelErrorMessages);

/// `true` when the error means the request can no longer be confirmed
/// (handled elsewhere, expired, changed, or gone).
bool isStaleRequestError(Object error) {
  final code = errorCodeOf(error);
  return code != null && staleRequestCodes.contains(code);
}

/// Sentence for a step the Assistant did not do: the agent's own words, or one
/// by code.
String rejectedMessage(AgentRejectedStep step) {
  final message = step.message?.trim() ?? '';
  if (message.isNotEmpty) return message;
  return rejectedFallbacks[step.code] ?? rejectedDefault;
}

/// Sentence for a microphone failure.
String micFailureMessage(MicFailure failure) => switch (failure) {
  MicFailure.denied => MicErrors.denied,
  MicFailure.failed => MicErrors.failed,
};
