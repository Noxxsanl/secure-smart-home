import 'dart:typed_data';

import '../../../core/utils/png_encoder.dart';

/// Size of every picture the mock camera produces.
const mockCameraWidth = 160;
const mockCameraHeight = 120;

/// A sample "living room" picture for the mock camera, drawn pixel by pixel in
/// pure Dart (no `dart:ui`, so it also works under `flutter test`).
///
/// [seed] picks the wall colour and where the figure stands; [frame] moves the
/// figure and a bright vertical bar, so consecutive live frames visibly differ.
Uint8List mockCameraPng({required int seed, int frame = 0}) {
  const w = mockCameraWidth;
  const h = mockCameraHeight;
  final rgb = Uint8List(w * h * 3);
  final tint = (seed * 37) % 60;
  const floorY = 84;
  // Figure: a head and a body that walks left and right.
  final walk = (frame * 3) % 240;
  final figureX = frame == 0
      ? 30 + (seed * 23) % 100
      : 20 + (walk < 120 ? walk : 240 - walk);
  final barX = (frame * 5) % w;

  for (var y = 0; y < h; y++) {
    for (var x = 0; x < w; x++) {
      int r;
      int g;
      int b;
      if (y < floorY) {
        // Wall: vertical gradient.
        r = 70 + tint + y ~/ 4;
        g = 90 + y ~/ 3;
        b = 120 + (tint ~/ 2) + y ~/ 4;
        // Window.
        if (x >= 100 && x < 144 && y >= 14 && y < 56) {
          r = 190;
          g = 220;
          b = 245;
          if (x == 121 || x == 122 || y == 35) {
            r = 90;
            g = 100;
            b = 120;
          }
        }
        // Sofa.
        if (x >= 12 && x < 82 && y >= 56 && y < floorY) {
          r = 120 - tint ~/ 3;
          g = 70;
          b = 60;
        }
      } else {
        // Floor.
        r = 120 - (y - floorY);
        g = 95 - (y - floorY) ~/ 2;
        b = 70;
      }
      // Figure.
      final dx = x - figureX;
      final head = dx * dx + (y - 52) * (y - 52) <= 36;
      final body = dx.abs() <= 8 && y >= 60 && y < 100;
      if (head) {
        r = 235;
        g = 200;
        b = 170;
      } else if (body) {
        r = 40 + tint;
        g = 60;
        b = 150;
      }
      // Moving bar (live view only).
      if (frame > 0 && (x - barX).abs() <= 2) {
        r = 255;
        g = 214;
        b = 64;
      }
      final i = (y * w + x) * 3;
      rgb[i] = r.clamp(0, 255);
      rgb[i + 1] = g.clamp(0, 255);
      rgb[i + 2] = b.clamp(0, 255);
    }
  }
  return encodePngRgb(w, h, rgb);
}
