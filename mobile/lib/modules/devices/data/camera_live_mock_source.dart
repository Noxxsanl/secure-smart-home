import 'dart:async';

import '../domain/camera_live.dart';
import 'camera_mock_scene.dart';

/// The "live view" of the mock camera (`USE_MOCK=true`): about five pictures a
/// second of an animated sample scene, after a short "connecting" state.
/// Cancelling the subscription stops the timer, like closing the real socket.
class CameraLiveMockSource implements CameraLiveSource {
  CameraLiveMockSource({
    this.interval = const Duration(milliseconds: 200),
    this.connectDelay = const Duration(milliseconds: 600),
  });

  /// Time between two frames (200 ms ≈ 5 frames per second).
  final Duration interval;

  /// How long the player shows "Đang kết nối camera…" before the first frame.
  final Duration connectDelay;

  @override
  Stream<CameraLiveEvent> watch(int deviceId) {
    late final StreamController<CameraLiveEvent> controller;
    Timer? connect;
    Timer? ticker;
    var frame = 0;

    void emitFrame() {
      frame++;
      controller.add(
        CameraLiveFrame(mockCameraPng(seed: deviceId, frame: frame)),
      );
    }

    controller = StreamController<CameraLiveEvent>(
      onListen: () {
        controller.add(
          const CameraLiveStateChanged(CameraLiveState.connecting),
        );
        connect = Timer(connectDelay, () {
          controller.add(const CameraLiveStateChanged(CameraLiveState.live));
          emitFrame();
          ticker = Timer.periodic(interval, (_) => emitFrame());
        });
      },
      onCancel: () {
        connect?.cancel();
        ticker?.cancel();
      },
    );
    return controller.stream;
  }
}
