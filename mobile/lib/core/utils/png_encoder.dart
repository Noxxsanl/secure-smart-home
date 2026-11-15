import 'dart:typed_data';

/// A tiny PNG encoder in pure Dart (8-bit RGB, no filtering, uncompressed
/// "stored" deflate blocks). It exists so the mock backend can make pictures
/// without `dart:ui` (whose `toImage`/`toByteData` never complete under
/// `flutter test`) or `dart:io`, and so it runs on every platform. The output
/// is large for its size, which is fine for 160 × 120 sample pictures.
Uint8List encodePngRgb(int width, int height, Uint8List rgb) {
  if (width <= 0 || height <= 0 || rgb.length != width * height * 3) {
    throw ArgumentError('rgb must hold width * height * 3 bytes');
  }
  final stride = width * 3;
  // Each scanline starts with its filter type (0 = none).
  final raw = Uint8List(height * (stride + 1));
  for (var y = 0; y < height; y++) {
    final out = y * (stride + 1);
    raw[out] = 0;
    raw.setRange(out + 1, out + 1 + stride, rgb, y * stride);
  }

  final header = ByteData(13)
    ..setUint32(0, width)
    ..setUint32(4, height)
    ..setUint8(8, 8) // bit depth
    ..setUint8(9, 2) // colour type: truecolour
    ..setUint8(10, 0) // deflate
    ..setUint8(11, 0) // filter method
    ..setUint8(12, 0); // no interlace

  final out = BytesBuilder(copy: false)
    ..add(pngSignature)
    ..add(_chunk('IHDR', header.buffer.asUint8List()))
    ..add(_chunk('IDAT', _zlibStored(raw)))
    ..add(_chunk('IEND', Uint8List(0)));
  return out.toBytes();
}

/// First 8 bytes of every PNG file.
const pngSignature = <int>[0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A];

/// zlib stream made of stored (uncompressed) deflate blocks.
Uint8List _zlibStored(Uint8List data) {
  const maxBlock = 0xFFFF;
  final out = BytesBuilder(copy: false)..add(const [0x78, 0x01]);
  var offset = 0;
  do {
    final length = data.length - offset > maxBlock
        ? maxBlock
        : data.length - offset;
    final last = offset + length >= data.length;
    final block = ByteData(5)
      ..setUint8(0, last ? 1 : 0)
      ..setUint16(1, length, Endian.little)
      ..setUint16(3, length ^ 0xFFFF, Endian.little);
    out
      ..add(block.buffer.asUint8List())
      ..add(Uint8List.sublistView(data, offset, offset + length));
    offset += length;
  } while (offset < data.length);
  final tail = ByteData(4)..setUint32(0, adler32(data));
  out.add(tail.buffer.asUint8List());
  return out.toBytes();
}

Uint8List _chunk(String type, Uint8List data) {
  final typeBytes = Uint8List.fromList(type.codeUnits);
  final body = BytesBuilder(copy: false)
    ..add(typeBytes)
    ..add(data);
  final bytes = body.toBytes();
  final out = ByteData(12 + data.length);
  out.setUint32(0, data.length);
  final view = out.buffer.asUint8List();
  view.setRange(4, 4 + bytes.length, bytes);
  out.setUint32(8 + data.length, crc32(bytes));
  return view;
}

/// Adler-32 checksum (zlib trailer).
int adler32(Uint8List data) {
  var a = 1;
  var b = 0;
  for (final byte in data) {
    a = (a + byte) % 65521;
    b = (b + a) % 65521;
  }
  return (b << 16) | a;
}

final Uint32List _crcTable = () {
  final table = Uint32List(256);
  for (var n = 0; n < 256; n++) {
    var c = n;
    for (var k = 0; k < 8; k++) {
      c = (c & 1) != 0 ? 0xEDB88320 ^ (c >> 1) : c >> 1;
    }
    table[n] = c;
  }
  return table;
}();

/// CRC-32 (PNG chunk checksum).
int crc32(Uint8List data) {
  var c = 0xFFFFFFFF;
  for (final byte in data) {
    c = _crcTable[(c ^ byte) & 0xFF] ^ (c >> 8);
  }
  return (c ^ 0xFFFFFFFF) & 0xFFFFFFFF;
}
