import 'dart:typed_data';

/// Live view of a camera as a stream of JPEG frames (the ESP32-CAM sends
/// MJPEG; the Gateway already shows it on its screen).
///
/// The app never talks to the camera or to MQTT directly (invariant 7): a
/// future implementation reads a stream relayed by the backend for the
/// signed-in member (e.g. `GET /api/mobile/devices/:id/live` as
/// `multipart/x-mixed-replace`, or binary WebSocket frames), with the Bearer
/// token in a header — never in the URL. Until the backend relays the stream,
/// no source is registered and the player explains that live view is not
/// available yet.
abstract interface class CameraLiveSource {
  /// Frames of [deviceId] while the stream is listened to; cancelling the
  /// subscription closes the connection. Errors are reported on the stream
  /// (the player offers a retry).
  Stream<Uint8List> frames(int deviceId);
}

/// What the live player shows.
enum CameraLiveStatus {
  /// No live source in this build (the backend does not relay the stream yet).
  unavailable,

  /// Ready; the user has not started the stream (saves camera bandwidth).
  idle,

  /// Connecting / waiting for the first frame.
  connecting,

  /// Frames are arriving.
  playing,

  /// The stream failed or stopped sending frames.
  failed,
}
