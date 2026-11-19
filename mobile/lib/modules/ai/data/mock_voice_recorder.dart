import 'dart:typed_data';

import '../domain/assistant_repository.dart';
import '../domain/voice_recorder.dart';
import '../domain/wav_encoder.dart';

/// Used with `USE_MOCK=true`: needs no microphone. It "records" one second of
/// silence so the mock Assistant can answer a voice message.
class MockVoiceRecorder implements VoiceRecorder {
  var _recording = false;

  @override
  Future<bool> isPermissionGranted() async => true;

  @override
  Future<void> start() async {
    _recording = true;
  }

  @override
  Future<RecordedAudio?> stop() async {
    if (!_recording) return null;
    _recording = false;
    final pcm = Uint8List(pcmBytesPerMs * 1000);
    return RecordedAudio(
      bytes: encodeWav(pcm),
      mimeType: wavMimeType,
      durationMs: 1000,
    );
  }

  @override
  Future<void> cancel() async {
    _recording = false;
  }

  @override
  Future<void> dispose() async {
    _recording = false;
  }
}
