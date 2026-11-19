import 'dart:typed_data';

/// PCM format the Assistant records in: 16-bit little-endian, mono, 16 kHz
/// (what speech recognition wants; 30 s = 960 000 bytes < the 1 MB limit).
const pcmSampleRate = 16000;
const pcmChannels = 1;
const pcmBytesPerSample = 2;

/// Bytes per millisecond of PCM audio at the format above.
const pcmBytesPerMs = pcmSampleRate * pcmChannels * pcmBytesPerSample ~/ 1000;

const wavHeaderBytes = 44;
const wavMimeType = 'audio/wav';

/// Largest PCM payload kept for one message (30 s).
const maxPcmBytes = 30 * 1000 * pcmBytesPerMs;

/// Duration of [pcmBytes] bytes of PCM audio.
int pcmDurationMs(int pcmBytes) => pcmBytes ~/ pcmBytesPerMs;

/// Wraps raw PCM16 mono samples in a 44-byte RIFF/WAVE header, in memory
/// (nothing is written to disk).
Uint8List encodeWav(
  Uint8List pcm, {
  int sampleRate = pcmSampleRate,
  int channels = pcmChannels,
}) {
  final dataLength = pcm.length;
  final byteRate = sampleRate * channels * pcmBytesPerSample;
  final out = Uint8List(wavHeaderBytes + dataLength);
  final header = ByteData.sublistView(out, 0, wavHeaderBytes);

  void tag(int offset, String text) {
    for (var i = 0; i < text.length; i++) {
      header.setUint8(offset + i, text.codeUnitAt(i));
    }
  }

  tag(0, 'RIFF');
  header.setUint32(4, 36 + dataLength, Endian.little);
  tag(8, 'WAVE');
  tag(12, 'fmt ');
  header.setUint32(16, 16, Endian.little); // PCM format chunk size
  header.setUint16(20, 1, Endian.little); // audio format = PCM
  header.setUint16(22, channels, Endian.little);
  header.setUint32(24, sampleRate, Endian.little);
  header.setUint32(28, byteRate, Endian.little);
  header.setUint16(32, channels * pcmBytesPerSample, Endian.little);
  header.setUint16(34, 8 * pcmBytesPerSample, Endian.little);
  tag(36, 'data');
  header.setUint32(40, dataLength, Endian.little);
  out.setRange(wavHeaderBytes, out.length, pcm);
  return out;
}
