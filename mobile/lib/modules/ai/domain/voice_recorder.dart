import 'assistant_repository.dart';

/// Phase of the microphone button.
enum RecorderPhase { idle, starting, recording }

/// Why the microphone could not start.
enum MicFailure { denied, failed }

class MicException implements Exception {
  const MicException(this.failure);

  final MicFailure failure;

  @override
  String toString() => 'MicException($failure)';
}

/// Captures one voice message in memory. Implementations must ask for the
/// microphone permission only inside [start] (when the user taps the mic),
/// never write the audio to disk, and stop capturing after 30 s of audio.
abstract interface class VoiceRecorder {
  /// Whether the microphone permission is already granted — never shows the
  /// system dialog (tells "released too early" apart from "the permission
  /// dialog took the touch").
  Future<bool> isPermissionGranted();

  /// Asks for permission if needed and begins capturing. Throws
  /// [MicException] when it cannot.
  Future<void> start();

  /// Stops and returns the recording (WAV), or `null` when nothing was
  /// captured.
  Future<RecordedAudio?> stop();

  /// Stops and throws the audio away.
  Future<void> cancel();

  /// Releases the microphone for good.
  Future<void> dispose();
}
