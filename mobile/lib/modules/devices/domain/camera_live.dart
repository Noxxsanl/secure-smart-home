import 'dart:typed_data';

/// Live view of a camera as a stream of JPEG frames (FR-5.8). The ESP32-CAM
/// sends MJPEG to the Gateway, the backend relays it over the WebSocket
/// `/api/mobile/cameras/:id/live`; the app never talks to the camera or to MQTT
/// directly (invariant 7).
///
/// The stream only exists while the player listens to it; cancelling the
/// subscription closes the connection. The access token is sent in the first
/// WebSocket frame, never in the URL.
abstract interface class CameraLiveSource {
  /// Events of [deviceId]. The stream ends right after a [CameraLiveEnded]
  /// (no more reconnects); it never emits an error.
  Stream<CameraLiveEvent> watch(int deviceId);
}

/// Connection state reported by the backend (`{"type":"state","state":…}`).
enum CameraLiveState {
  connecting,
  live,
  reconnecting,
  cameraUnavailable;

  /// `connecting|live|reconnecting|camera_unavailable`; anything else → `null`.
  static CameraLiveState? fromApi(Object? value) => switch (value) {
    'connecting' => connecting,
    'live' => live,
    'reconnecting' => reconnecting,
    'camera_unavailable' => cameraUnavailable,
    _ => null,
  };
}

/// One event of a live stream.
sealed class CameraLiveEvent {
  const CameraLiveEvent();
}

/// One JPEG picture.
final class CameraLiveFrame extends CameraLiveEvent {
  const CameraLiveFrame(this.bytes);

  final Uint8List bytes;
}

/// The backend (or the app, while it reconnects) changed the connection state.
final class CameraLiveStateChanged extends CameraLiveEvent {
  const CameraLiveStateChanged(this.state);

  final CameraLiveState state;
}

/// The stream stopped for good; [message] is Vietnamese guidance for the user.
final class CameraLiveEnded extends CameraLiveEvent {
  const CameraLiveEnded(this.message);

  final String message;
}

/// What the live player shows.
enum CameraLiveStatus {
  /// No live source in this build (mock mode).
  unavailable,

  /// Ready; the user has not started the stream (saves camera bandwidth).
  idle,

  /// Connecting / waiting for the first frame.
  connecting,

  /// Frames are arriving.
  playing,

  /// Signal lost, reconnecting (the last frame stays visible).
  reconnecting,

  /// The stream ended with an error the user must read.
  failed,
}

// -------------------------------------------------------------- close codes

/// Reconnect delays after an abnormal drop (1006, no network); after the last
/// one the stream gives up.
const cameraLiveRetryDelays = [
  Duration(seconds: 1),
  Duration(seconds: 2),
  Duration(seconds: 4),
];

const cameraLiveConnectingMessage = 'Đang kết nối camera…';
const cameraLiveReconnectingMessage = 'Mất tín hiệu, đang kết nối lại…';
const cameraLiveEndedMessage = 'Phiên xem đã kết thúc';
const cameraLiveGenericCloseMessage =
    'Không xem được camera lúc này, hãy thử lại sau';

/// Close code the backend uses when the access token is missing or expired.
const cameraLiveAuthCloseCode = 4401;

/// Backend close codes (4xxx): retrying is pointless, so show guidance and
/// stop. Wording follows the web player (`devices/model/cameraLive.ts`).
const _closeMessages = <int, String>{
  4401: 'Phiên đăng nhập đã hết hạn, hãy đăng nhập lại',
  4403:
      'Bạn không có quyền xem trực tiếp camera này (khách được mời không xem '
      'được)',
  4404: 'Không tìm thấy camera',
  4408: 'Camera không phản hồi — kiểm tra nguồn camera và Gateway',
  4409: 'Camera đang có quá nhiều người xem, hãy thử lại sau',
  4429: 'Bạn đang mở quá nhiều luồng xem, hãy đóng bớt luồng khác rồi thử lại',
  4501: 'Camera mô phỏng không hỗ trợ xem trực tiếp',
};

/// What to do after the socket closed with [code].
sealed class CameraLiveCloseVerdict {
  const CameraLiveCloseVerdict();
}

/// Retry later (abnormal drop: 1006, network lost, no close code).
final class CameraLiveRetry extends CameraLiveCloseVerdict {
  const CameraLiveRetry();
}

/// 4401: refresh the access token and reconnect once.
final class CameraLiveRefreshToken extends CameraLiveCloseVerdict {
  const CameraLiveRefreshToken();
}

/// Stop and show [message].
final class CameraLiveStop extends CameraLiveCloseVerdict {
  const CameraLiveStop(this.message);

  final String message;
}

CameraLiveCloseVerdict classifyCameraLiveClose(int? code) {
  if (code == cameraLiveAuthCloseCode) return const CameraLiveRefreshToken();
  if (code == 1000) return const CameraLiveStop(cameraLiveEndedMessage);
  if (code != null && code >= 4000 && code < 5000) {
    return CameraLiveStop(
      _closeMessages[code] ?? cameraLiveGenericCloseMessage,
    );
  }
  return const CameraLiveRetry();
}

/// Guidance for a close code that ends the stream (used for the 4401 that
/// survives one refresh, and for the `camera_unavailable` state).
String cameraLiveCloseMessage(int code) =>
    _closeMessages[code] ?? cameraLiveGenericCloseMessage;

/// Text for each backend state while no picture is on screen.
String cameraLiveStateMessage(CameraLiveState state) => switch (state) {
  CameraLiveState.connecting ||
  CameraLiveState.live => cameraLiveConnectingMessage,
  CameraLiveState.reconnecting => cameraLiveReconnectingMessage,
  CameraLiveState.cameraUnavailable => cameraLiveCloseMessage(4408),
};
