import '../../../core/network/api_client.dart';
import '../../../core/utils/json.dart';
import '../domain/agent_reply.dart';
import '../domain/assistant_repository.dart';
import '../domain/assistant_schedule.dart';
import 'agent_mapper.dart';

/// Typed/voice messages go to the AI Agent (`{agentBaseUrl}/homes/:id/…`);
/// confirmations and cancellations go to the backend on `/api/mobile`.
/// Neither the audio nor what the user said is logged or kept.
class RemoteAssistantRepository implements AssistantRepository {
  RemoteAssistantRepository(
    this._api, {
    required String agentBaseUrl,
    this.agentTimeout = const Duration(seconds: 60),
  }) : _agentBaseUrl = agentBaseUrl.endsWith('/')
           ? agentBaseUrl.substring(0, agentBaseUrl.length - 1)
           : agentBaseUrl;

  final ApiClient _api;
  final String _agentBaseUrl;

  /// Speech recognition + the LLM can take a while.
  final Duration agentTimeout;

  @override
  Future<AgentReply> sendText(
    int homeId,
    String text, {
    String? conversationId,
  }) async {
    final data = await _api.postUrl(
      '$_agentBaseUrl/homes/$homeId/messages',
      body: {'text': text, 'conversation_id': ?conversationId},
      timeout: agentTimeout,
    );
    return agentReplyFromJson(asJson(data));
  }

  @override
  Future<AgentReply> sendVoice(
    int homeId,
    RecordedAudio audio, {
    String? conversationId,
  }) async {
    final data = await _api.postBytesUrl(
      '$_agentBaseUrl/homes/$homeId/voice',
      bytes: audio.bytes,
      contentType: audio.mimeType,
      headers: {'X-Audio-Duration-Ms': audio.durationMs.toString()},
      query: {'conversation_id': conversationId},
      timeout: agentTimeout,
    );
    return agentReplyFromJson(asJson(data));
  }

  @override
  Future<AgentConfirmResult> confirm(
    int requestId,
    String requestHash,
    List<int> stepIndexes,
  ) async {
    final data = await _api.post(
      '/agent/requests/$requestId/confirm',
      body: {'request_hash': requestHash, 'step_indexes': stepIndexes},
    );
    return agentConfirmResultFromJson(asJson(data));
  }

  @override
  Future<void> reject(int requestId) async {
    await _api.post('/agent/requests/$requestId/reject');
  }

  @override
  Future<AssistantSchedule> cancelSchedule(int scheduleId) async {
    final data = await _api.post('/schedules/$scheduleId/cancel');
    return assistantScheduleFromJson(asJson(data));
  }
}
