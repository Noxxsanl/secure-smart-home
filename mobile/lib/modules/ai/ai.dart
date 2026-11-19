/// Public API of the ai module (the voice/text Assistant: conversation state,
/// recorder, repository, reply types) for other modules. The mic in the
/// navigation bar: ai_module.dart (only lib/app/ imports it).
library;

export 'application/assistant_errors.dart';
export 'application/assistant_providers.dart';
export 'application/voice_recorder_controller.dart';
// Contract mapper: `AgentReply` / `Schedule` payloads.
export 'data/agent_mapper.dart';
export 'domain/agent_reply.dart';
export 'domain/assistant_repository.dart';
export 'domain/assistant_schedule.dart';
export 'domain/chat_entry.dart';
export 'domain/voice_recorder.dart';
export 'domain/wav_encoder.dart';
