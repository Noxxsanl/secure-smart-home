import 'dart:async';

import 'package:flutter/foundation.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/config/app_config.dart';
import '../data/mock_voice_recorder.dart';
import '../data/record_voice_recorder.dart';
import '../domain/assistant_repository.dart';
import '../domain/assistant_texts.dart';
import '../domain/voice_recorder.dart';
import 'assistant_errors.dart';

/// The microphone behind the mic button. Replace it in tests with a fake
/// [VoiceRecorder]; with `USE_MOCK=true` no real microphone is used.
final voiceRecorderProvider = Provider<VoiceRecorder>((ref) {
  final VoiceRecorder recorder = ref.watch(appConfigProvider).useMock
      ? MockVoiceRecorder()
      : RecordVoiceRecorder();
  ref.onDispose(() => unawaited(recorder.dispose()));
  return recorder;
});

@immutable
class RecorderState {
  const RecorderState({
    this.phase = RecorderPhase.idle,
    this.seconds = 0,
    this.error,
  });

  final RecorderPhase phase;

  /// Whole seconds recorded so far (0..30).
  final int seconds;

  /// Vietnamese guidance for the last failure; cleared by the next attempt.
  final String? error;

  bool get isRecording => phase == RecorderPhase.recording;
}

/// Hold-to-talk: [start] when the finger goes down, [stop] to hand the audio
/// over when it lifts, [cancel] to throw it away. Stops by itself at 30 s,
/// drops recordings shorter than 0.6 s and ones above 1 MB.
class VoiceRecorderController extends Notifier<RecorderState> {
  static const _tick = Duration(milliseconds: 250);

  Timer? _timer;
  var _ticks = 0;
  var _capturing = false;
  void Function(RecordedAudio audio)? _onComplete;

  @override
  RecorderState build() {
    final recorder = ref.read(voiceRecorderProvider);
    ref.onDispose(() {
      _timer?.cancel();
      _onComplete = null;
      if (_capturing) unawaited(recorder.cancel());
    });
    return const RecorderState();
  }

  /// Asks for the microphone permission (first time) and starts recording;
  /// [onComplete] gets the finished audio.
  Future<void> start(void Function(RecordedAudio audio) onComplete) async {
    if (state.phase != RecorderPhase.idle) return;
    final recorder = ref.read(voiceRecorderProvider);
    state = const RecorderState(phase: RecorderPhase.starting);
    _capturing = true;
    try {
      await recorder.start();
    } on MicException catch (error) {
      _capturing = false;
      if (ref.mounted) {
        state = RecorderState(error: micFailureMessage(error.failure));
      }
      return;
    } on Object {
      _capturing = false;
      if (ref.mounted) {
        state = RecorderState(error: micFailureMessage(MicFailure.failed));
      }
      return;
    }
    if (!ref.mounted) {
      unawaited(recorder.cancel());
      return;
    }
    _onComplete = onComplete;
    _ticks = 0;
    state = const RecorderState(phase: RecorderPhase.recording);
    _timer = Timer.periodic(_tick, (_) {
      _ticks++;
      final elapsedMs = _ticks * _tick.inMilliseconds;
      if (elapsedMs >= maxRecordSeconds * 1000) {
        unawaited(stop());
        return;
      }
      state = RecorderState(
        phase: RecorderPhase.recording,
        seconds: elapsedMs ~/ 1000,
      );
    });
  }

  /// Stops and delivers the recording to the `onComplete` given to [start].
  Future<void> stop() async {
    if (!state.isRecording) return;
    _timer?.cancel();
    _timer = null;
    final onComplete = _onComplete;
    _onComplete = null;
    state = const RecorderState();
    final recorder = ref.read(voiceRecorderProvider);
    RecordedAudio? audio;
    try {
      audio = await recorder.stop();
    } on Object {
      _capturing = false;
      if (ref.mounted) {
        state = RecorderState(error: micFailureMessage(MicFailure.failed));
      }
      return;
    }
    _capturing = false;
    if (!ref.mounted) return;
    if (audio == null || audio.durationMs < minRecordMs) {
      state = const RecorderState(error: MicErrors.tooShort);
      return;
    }
    if (audio.bytes.length > audioMaxBytes) {
      state = const RecorderState(error: MicErrors.tooLarge);
      return;
    }
    onComplete?.call(audio);
  }

  /// Stops and throws the recording away (released far from the button): no
  /// audio is handed over and no error is shown.
  Future<void> cancel() async {
    if (!state.isRecording) return;
    _timer?.cancel();
    _timer = null;
    _onComplete = null;
    state = const RecorderState();
    final recorder = ref.read(voiceRecorderProvider);
    try {
      await recorder.cancel();
    } on Object {
      // Nothing left to release.
    }
    _capturing = false;
  }

  void clearError() {
    if (state.error != null) {
      state = RecorderState(phase: state.phase, seconds: state.seconds);
    }
  }
}

final voiceRecorderControllerProvider =
    NotifierProvider.autoDispose<VoiceRecorderController, RecorderState>(
      VoiceRecorderController.new,
    );
