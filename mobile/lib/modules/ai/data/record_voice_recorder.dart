import 'dart:async';
import 'dart:typed_data';

import 'package:record/record.dart';

import '../domain/assistant_repository.dart';
import '../domain/voice_recorder.dart';
import '../domain/wav_encoder.dart';

/// Microphone capture with the `record` package: PCM16 mono 16 kHz streamed
/// into memory (never to a file), wrapped in a WAV header when stopped. The
/// permission is requested inside [start] only; capture stops by itself at 30 s
/// of audio so the upload stays under 1 MB.
class RecordVoiceRecorder implements VoiceRecorder {
  AudioRecorder? _recorder;
  StreamSubscription<Uint8List>? _subscription;
  Completer<void>? _streamClosed;
  final _pcm = BytesBuilder(copy: false);
  var _length = 0;

  @override
  Future<bool> isPermissionGranted() async {
    try {
      return await (_recorder ??= AudioRecorder()).hasPermission(
        request: false,
      );
    } on Object {
      return false;
    }
  }

  @override
  Future<void> start() async {
    await _release();
    final recorder = _recorder ??= AudioRecorder();
    final bool granted;
    try {
      granted = await recorder.hasPermission();
    } on Object {
      throw const MicException(MicFailure.failed);
    }
    if (!granted) throw const MicException(MicFailure.denied);

    _pcm.clear();
    _length = 0;
    final closed = Completer<void>();
    _streamClosed = closed;
    try {
      final stream = await recorder.startStream(
        const RecordConfig(
          encoder: AudioEncoder.pcm16bits,
          sampleRate: pcmSampleRate,
          numChannels: pcmChannels,
        ),
      );
      _subscription = stream.listen(
        _onData,
        onDone: () {
          if (!closed.isCompleted) closed.complete();
        },
        onError: (Object _) {
          if (!closed.isCompleted) closed.complete();
        },
        cancelOnError: true,
      );
    } on Object {
      throw const MicException(MicFailure.failed);
    }
  }

  void _onData(Uint8List chunk) {
    final room = maxPcmBytes - _length;
    if (room <= 0) return;
    final part = chunk.length <= room ? chunk : chunk.sublist(0, room);
    _pcm.add(part);
    _length += part.length;
  }

  @override
  Future<RecordedAudio?> stop() async {
    final recorder = _recorder;
    if (recorder == null) return null;
    try {
      await recorder.stop();
      // Let the last buffered chunks arrive before closing the stream.
      await _streamClosed?.future.timeout(
        const Duration(seconds: 1),
        onTimeout: () {},
      );
    } on Object {
      // Fall through with what was captured.
    }
    await _subscription?.cancel();
    _subscription = null;
    _streamClosed = null;
    final pcm = _pcm.takeBytes();
    _length = 0;
    if (pcm.isEmpty) return null;
    return RecordedAudio(
      bytes: encodeWav(pcm),
      mimeType: wavMimeType,
      durationMs: pcmDurationMs(pcm.length),
    );
  }

  @override
  Future<void> cancel() async {
    await _release();
  }

  Future<void> _release() async {
    final recorder = _recorder;
    await _subscription?.cancel();
    _subscription = null;
    _streamClosed = null;
    _pcm.clear();
    _length = 0;
    if (recorder == null) return;
    try {
      if (await recorder.isRecording()) await recorder.cancel();
    } on Object {
      // Nothing left to release.
    }
  }

  @override
  Future<void> dispose() async {
    await _release();
    try {
      await _recorder?.dispose();
    } on Object {
      // Already gone.
    }
    _recorder = null;
  }
}
