import 'dart:async';

import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../../core/config/app_config.dart';
import '../../../../core/network/error_messages.dart' show networkErrorMessage;
import '../../../../core/theme/app_theme.dart';
import '../../../../core/widgets/app_widgets.dart';
import '../../application/camera_live_providers.dart';
import '../../domain/camera_live.dart';
import '../../domain/device.dart';

/// "Xem trực tiếp": 4:3 player for a camera's live stream (FR-5.8).
///
/// The stream only runs after the user taps play (the ESP32-CAM serves few
/// clients and every frame costs bandwidth) and stops when the page closes.
/// Events come from [cameraLiveSourceProvider]: pictures, the relay's state
/// ("Đang kết nối camera…", "Mất tín hiệu, đang kết nối lại…") and the final
/// guidance sentence when the stream ends. Mock mode plays an animated sample
/// scene; while no source is registered the player stays in
/// [CameraLiveStatus.unavailable] and says why.
/// Full screen reuses the same subscription, so it never opens a second
/// connection to the camera.
class CameraLiveView extends ConsumerStatefulWidget {
  const CameraLiveView({
    super.key,
    required this.device,
    this.autoStart = false,
  });

  final CustomerDevice device;

  /// Start streaming right after the first frame of the page (an offline
  /// camera or a build without a live source just shows the player).
  final bool autoStart;

  @override
  ConsumerState<CameraLiveView> createState() => _CameraLiveViewState();
}

class _CameraLiveViewState extends ConsumerState<CameraLiveView> {
  final _frame = ValueNotifier<Uint8List?>(null);
  StreamSubscription<CameraLiveEvent>? _subscription;
  CameraLiveStatus _status = CameraLiveStatus.idle;

  /// Sentence for the current non-playing status (connecting, reconnecting,
  /// failed); `null` falls back to the generic text.
  String? _message;

  CameraLiveSource? get _source => ref.read(cameraLiveSourceProvider);

  @override
  void initState() {
    super.initState();
    if (widget.autoStart) {
      WidgetsBinding.instance.addPostFrameCallback((_) {
        if (mounted && _subscription == null) _start();
      });
    }
  }

  CameraLiveStatus get _shownStatus {
    if (ref.watch(cameraLiveSourceProvider) == null) {
      return CameraLiveStatus.unavailable;
    }
    return _status;
  }

  void _start() {
    final source = _source;
    if (source == null || !widget.device.online) return;
    _stop(keepFrame: false);
    setState(() {
      _status = CameraLiveStatus.connecting;
      _message = cameraLiveConnectingMessage;
    });
    _subscription = source
        .watch(widget.device.id)
        .listen(
          _onEvent,
          onError: (Object _) => _fail(networkErrorMessage),
          onDone: () {
            // The source always sends CameraLiveEnded first; a bare close is
            // an unexpected stop.
            if (_subscription != null) _fail(cameraLiveEndedMessage);
          },
          cancelOnError: true,
        );
  }

  void _onEvent(CameraLiveEvent event) {
    if (!mounted) return;
    switch (event) {
      case CameraLiveFrame(:final bytes):
        _frame.value = bytes;
        if (_status != CameraLiveStatus.playing) {
          setState(() {
            _status = CameraLiveStatus.playing;
            _message = null;
          });
        }
      case CameraLiveStateChanged(:final state):
        // `live` only says the relay is up; the status flips on the first frame.
        if (state == CameraLiveState.live) return;
        setState(() {
          _status = state == CameraLiveState.connecting
              ? (_frame.value == null
                    ? CameraLiveStatus.connecting
                    : CameraLiveStatus.reconnecting)
              : CameraLiveStatus.reconnecting;
          _message = cameraLiveStateMessage(state);
        });
      case CameraLiveEnded(:final message):
        _fail(message);
    }
  }

  void _fail(String message) {
    _stop(keepFrame: true);
    if (mounted) {
      setState(() {
        _status = CameraLiveStatus.failed;
        _message = message;
      });
    }
  }

  void _stop({required bool keepFrame}) {
    unawaited(_subscription?.cancel());
    _subscription = null;
    if (!keepFrame) _frame.value = null;
  }

  void _pause() {
    _stop(keepFrame: true);
    setState(() {
      _status = CameraLiveStatus.idle;
      _message = null;
    });
  }

  @override
  void didUpdateWidget(covariant CameraLiveView oldWidget) {
    super.didUpdateWidget(oldWidget);
    // Camera went offline while watching → stop instead of waiting for the relay.
    if (!widget.device.online && _subscription != null) {
      _fail(
        'Camera đang ngoại tuyến. Kiểm tra nguồn điện của camera và WiFi '
        'của Gateway.',
      );
    }
  }

  @override
  void dispose() {
    _stop(keepFrame: false);
    _frame.dispose();
    super.dispose();
  }

  void _openFullScreen() {
    showDialog<void>(
      context: context,
      builder: (context) => Dialog.fullscreen(
        backgroundColor: Colors.black,
        child: Stack(
          children: [
            Positioned.fill(
              child: InteractiveViewer(
                maxScale: 4,
                child: Center(
                  child: _FrameView(frame: _frame, fit: BoxFit.contain),
                ),
              ),
            ),
            const Positioned(top: 16, left: 16, child: _LiveBadge(live: true)),
            Positioned(
              top: 8,
              right: 8,
              child: SafeArea(
                child: IconButton(
                  tooltip: 'Thoát toàn màn hình',
                  icon: const Icon(Icons.close, color: Colors.white),
                  onPressed: () => Navigator.of(context).pop(),
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final status = _shownStatus;
    final online = widget.device.online;
    final playing = status == CameraLiveStatus.playing;
    final reconnecting = status == CameraLiveStatus.reconnecting;
    final running =
        playing || reconnecting || status == CameraLiveStatus.connecting;
    final useMock = ref.watch(appConfigProvider).useMock;

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        const SectionHeader('Xem trực tiếp'),
        ClipRRect(
          borderRadius: BorderRadius.circular(20),
          child: AspectRatio(
            aspectRatio: 4 / 3,
            child: ColoredBox(
              color: const Color(0xFF0F172A),
              child: Stack(
                fit: StackFit.expand,
                children: [
                  if (playing ||
                      reconnecting ||
                      status == CameraLiveStatus.failed)
                    _FrameView(frame: _frame, fit: BoxFit.cover),
                  if (!playing)
                    _Overlay(
                      status: status,
                      online: online,
                      message: _message,
                      onPlay: _start,
                    ),
                  Positioned(
                    top: 12,
                    left: 12,
                    child: _LiveBadge(live: playing),
                  ),
                  if (running)
                    Positioned(
                      right: 4,
                      bottom: 4,
                      child: Row(
                        children: [
                          IconButton(
                            key: const ValueKey<String>('camera-live-pause'),
                            tooltip: 'Dừng xem',
                            icon: const Icon(
                              Icons.pause_circle_outline,
                              color: Colors.white,
                            ),
                            onPressed: _pause,
                          ),
                          if (playing || reconnecting)
                            IconButton(
                              key: const ValueKey<String>(
                                'camera-live-fullscreen',
                              ),
                              tooltip: 'Toàn màn hình',
                              icon: const Icon(
                                Icons.fullscreen,
                                color: Colors.white,
                              ),
                              onPressed: _openFullScreen,
                            ),
                        ],
                      ),
                    ),
                ],
              ),
            ),
          ),
        ),
        const SizedBox(height: 8),
        Text(
          _caption(status, online, useMock),
          style: const TextStyle(fontSize: 12, color: AppColors.textSecondary),
        ),
      ],
    );
  }

  String _failedCaption() {
    final text = _message ?? cameraLiveGenericCloseMessage;
    final sentence = text.endsWith('.') ? text : '$text.';
    return '$sentence Bấm thử lại.';
  }

  String _caption(CameraLiveStatus status, bool online, bool useMock) {
    if (status == CameraLiveStatus.unavailable) {
      return 'Xem trực tiếp chưa dùng được trên máy chủ này. Hình vẫn xem được '
          'trên màn hình Gateway trong nhà.';
    }
    if (!online) {
      return 'Camera đang ngoại tuyến. Kiểm tra nguồn điện của camera và WiFi của Gateway.';
    }
    return switch (status) {
      CameraLiveStatus.playing =>
        useMock
            ? 'Đang phát hình mô phỏng (chế độ thử, không có camera thật). Hình sẽ dừng khi bạn rời trang này.'
            : 'Đang phát trực tiếp. Hình sẽ dừng khi bạn rời trang này.',
      CameraLiveStatus.connecting || CameraLiveStatus.reconnecting =>
        'Camera có thể mất vài giây để bắt đầu truyền hình. Hình sẽ dừng khi '
            'bạn rời trang này.',
      CameraLiveStatus.failed => _failedCaption(),
      _ => 'Bấm nút phát để xem hình trực tiếp từ camera.',
    };
  }
}

/// Latest frame; only this widget rebuilds per frame.
class _FrameView extends StatelessWidget {
  const _FrameView({required this.frame, required this.fit});

  final ValueListenable<Uint8List?> frame;
  final BoxFit fit;

  @override
  Widget build(BuildContext context) {
    return ValueListenableBuilder<Uint8List?>(
      valueListenable: frame,
      builder: (context, bytes, _) {
        if (bytes == null) return const SizedBox.shrink();
        return Image.memory(
          bytes,
          fit: fit,
          gaplessPlayback: true,
          errorBuilder: (_, _, _) => const SizedBox.shrink(),
        );
      },
    );
  }
}

class _Overlay extends StatelessWidget {
  const _Overlay({
    required this.status,
    required this.online,
    required this.message,
    required this.onPlay,
  });

  final CameraLiveStatus status;
  final bool online;
  final String? message;
  final VoidCallback onPlay;

  @override
  Widget build(BuildContext context) {
    if (status == CameraLiveStatus.connecting ||
        status == CameraLiveStatus.reconnecting) {
      return ColoredBox(
        color: status == CameraLiveStatus.reconnecting
            ? Colors.black45
            : Colors.transparent,
        child: Center(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              const CircularProgressIndicator(color: Colors.white),
              const SizedBox(height: 12),
              Padding(
                padding: const EdgeInsets.symmetric(horizontal: 24),
                child: Text(
                  message ?? cameraLiveConnectingMessage,
                  textAlign: TextAlign.center,
                  style: const TextStyle(color: Colors.white70),
                ),
              ),
            ],
          ),
        ),
      );
    }
    final canPlay = status != CameraLiveStatus.unavailable && online;
    final failed = status == CameraLiveStatus.failed;
    final (IconData icon, String label) = switch (status) {
      CameraLiveStatus.unavailable => (
        Icons.videocam_off_outlined,
        'Chưa xem trực tiếp được',
      ),
      _ when !online => (Icons.videocam_off_outlined, 'Camera ngoại tuyến'),
      CameraLiveStatus.failed => (Icons.refresh, 'Thử lại'),
      _ => (Icons.play_arrow_rounded, 'Xem trực tiếp'),
    };
    return ColoredBox(
      color: failed ? Colors.black45 : Colors.transparent,
      child: Center(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Material(
              color: canPlay ? Colors.white24 : Colors.white10,
              shape: const CircleBorder(),
              child: InkWell(
                key: const ValueKey<String>('camera-live-play'),
                customBorder: const CircleBorder(),
                onTap: canPlay ? onPlay : null,
                child: Padding(
                  padding: const EdgeInsets.all(14),
                  child: Icon(
                    icon,
                    size: 36,
                    color: canPlay ? Colors.white : Colors.white54,
                  ),
                ),
              ),
            ),
            const SizedBox(height: 10),
            Text(
              label,
              textAlign: TextAlign.center,
              style: TextStyle(
                color: canPlay ? Colors.white : Colors.white60,
                fontWeight: FontWeight.w600,
              ),
            ),
          ],
        ),
      ),
    );
  }
}

/// "● TRỰC TIẾP" while frames arrive, grey "TRỰC TIẾP" otherwise.
class _LiveBadge extends StatelessWidget {
  const _LiveBadge({required this.live});

  final bool live;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
      decoration: BoxDecoration(
        color: live ? AppColors.critical : Colors.black54,
        borderRadius: BorderRadius.circular(6),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Container(
            width: 7,
            height: 7,
            decoration: BoxDecoration(
              color: live ? Colors.white : Colors.white54,
              shape: BoxShape.circle,
            ),
          ),
          const SizedBox(width: 6),
          Text(
            'TRỰC TIẾP',
            style: TextStyle(
              color: live ? Colors.white : Colors.white70,
              fontSize: 11,
              fontWeight: FontWeight.bold,
              letterSpacing: 0.5,
            ),
          ),
        ],
      ),
    );
  }
}
