import 'dart:async';

import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../../core/theme/app_theme.dart';
import '../../../../core/widgets/app_widgets.dart';
import '../../application/device_providers.dart';
import '../../domain/camera_live.dart';
import '../../domain/device.dart';

/// "Xem trực tiếp": 4:3 player for a camera's live stream.
///
/// The stream only runs after the user taps play (the ESP32-CAM serves few
/// clients and every frame costs bandwidth) and stops when the page closes.
/// Frames come from [cameraLiveSourceProvider]; while no source is registered
/// (the backend does not relay the stream yet) the player stays in
/// [CameraLiveStatus.unavailable] and explains where to watch live today.
/// Full screen reuses the same subscription, so it never opens a second
/// connection to the camera.
class CameraLiveView extends ConsumerStatefulWidget {
  const CameraLiveView({super.key, required this.device});

  final CustomerDevice device;

  @override
  ConsumerState<CameraLiveView> createState() => _CameraLiveViewState();
}

class _CameraLiveViewState extends ConsumerState<CameraLiveView> {
  /// No frame for this long while playing → treat the stream as lost.
  static const _stallTimeout = Duration(seconds: 8);

  final _frame = ValueNotifier<Uint8List?>(null);
  StreamSubscription<Uint8List>? _subscription;
  Timer? _stallTimer;
  CameraLiveStatus _status = CameraLiveStatus.idle;

  CameraLiveSource? get _source => ref.read(cameraLiveSourceProvider);

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
    setState(() => _status = CameraLiveStatus.connecting);
    _armStallTimer();
    _subscription = source
        .frames(widget.device.id)
        .listen(
          (bytes) {
            _frame.value = bytes;
            _armStallTimer();
            if (_status != CameraLiveStatus.playing && mounted) {
              setState(() => _status = CameraLiveStatus.playing);
            }
          },
          onError: (Object _) => _fail(),
          onDone: _fail,
          cancelOnError: true,
        );
  }

  void _armStallTimer() {
    _stallTimer?.cancel();
    _stallTimer = Timer(_stallTimeout, _fail);
  }

  void _fail() {
    _stop(keepFrame: true);
    if (mounted) setState(() => _status = CameraLiveStatus.failed);
  }

  void _stop({required bool keepFrame}) {
    _stallTimer?.cancel();
    _stallTimer = null;
    unawaited(_subscription?.cancel());
    _subscription = null;
    if (!keepFrame) _frame.value = null;
  }

  void _pause() {
    _stop(keepFrame: true);
    setState(() => _status = CameraLiveStatus.idle);
  }

  @override
  void didUpdateWidget(covariant CameraLiveView oldWidget) {
    super.didUpdateWidget(oldWidget);
    // Camera went offline while watching → stop instead of waiting for a stall.
    if (!widget.device.online && _subscription != null) _fail();
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
                  if (status == CameraLiveStatus.playing ||
                      status == CameraLiveStatus.failed)
                    _FrameView(frame: _frame, fit: BoxFit.cover),
                  if (!playing)
                    _Overlay(status: status, online: online, onPlay: _start),
                  Positioned(
                    top: 12,
                    left: 12,
                    child: _LiveBadge(live: playing),
                  ),
                  if (playing)
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
          _caption(status, online),
          style: const TextStyle(fontSize: 12, color: AppColors.textSecondary),
        ),
      ],
    );
  }

  static String _caption(CameraLiveStatus status, bool online) {
    if (status == CameraLiveStatus.unavailable) {
      return 'Hình trực tiếp hiện xem trên màn hình Gateway trong nhà. '
          'Ứng dụng sẽ phát được ngay khi máy chủ hỗ trợ chuyển tiếp luồng camera.';
    }
    if (!online) {
      return 'Camera đang ngoại tuyến. Kiểm tra nguồn điện của camera và WiFi của Gateway.';
    }
    return switch (status) {
      CameraLiveStatus.playing =>
        'Đang phát trực tiếp. Hình sẽ dừng khi bạn rời trang này.',
      CameraLiveStatus.failed =>
        'Mất kết nối tới camera. Bấm thử lại; nếu vẫn lỗi, kiểm tra WiFi của Gateway.',
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
    required this.onPlay,
  });

  final CameraLiveStatus status;
  final bool online;
  final VoidCallback onPlay;

  @override
  Widget build(BuildContext context) {
    if (status == CameraLiveStatus.connecting) {
      return const Center(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            CircularProgressIndicator(color: Colors.white),
            SizedBox(height: 12),
            Text(
              'Đang kết nối tới camera…',
              style: TextStyle(color: Colors.white70),
            ),
          ],
        ),
      );
    }
    final canPlay = status != CameraLiveStatus.unavailable && online;
    final failed = status == CameraLiveStatus.failed;
    final (IconData icon, String label) = switch (status) {
      CameraLiveStatus.unavailable => (
        Icons.videocam_off_outlined,
        'Chưa hỗ trợ xem trực tiếp trên ứng dụng',
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
