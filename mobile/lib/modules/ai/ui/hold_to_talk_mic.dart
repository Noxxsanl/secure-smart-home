import 'dart:async';

import 'package:flutter/gestures.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/theme/app_theme.dart';
import '../application/assistant_providers.dart';
import '../application/voice_recorder_controller.dart';
import '../domain/assistant_repository.dart';
import '../domain/assistant_texts.dart';
import '../domain/voice_recorder.dart';
import 'mic_button.dart';

/// Press time before a touch counts as "hold to talk" rather than a tap.
const holdToTalkDelay = Duration(milliseconds: 300);

/// Finger distance (dp) from where it went down beyond which releasing throws
/// the recording away.
const holdToTalkCancelDistance = 80.0;

/// The mic of the Assistant, used in the navigation bar and in the sheet:
/// a quick tap calls [onTap]; holding for 300 ms starts recording, releasing
/// hands the audio to [onAudio], dragging 80 dp away and releasing discards
/// it. Recording is capped at 30 s by the recorder (it then sends by itself).
///
/// Guidance that has no screen of its own goes to [onHint] (a tap, a busy
/// Assistant, permission just granted); microphone failures go to [onError]
/// (the sheet leaves it out: it shows the recorder's error itself).
class HoldToTalkMic extends ConsumerStatefulWidget {
  const HoldToTalkMic({
    super.key,
    required this.homeId,
    required this.onTap,
    required this.onAudio,
    this.onHint,
    this.onError,
    this.showBubble = false,
    this.size = 56,
    this.shadow = false,
    this.semanticLabel = 'Giữ để nói',
  });

  /// Home the voice message is about; `null` disables the button.
  final int? homeId;
  final VoidCallback onTap;

  /// Called with the finished recording (released in place, or the 30 s cap).
  final void Function(RecordedAudio audio) onAudio;
  final void Function(String message)? onHint;
  final void Function(String message)? onError;

  /// Floating "Đang nghe…" bubble above the button (needs room above it).
  final bool showBubble;
  final double size;
  final bool shadow;
  final String semanticLabel;

  @override
  ConsumerState<HoldToTalkMic> createState() => _HoldToTalkMicState();
}

class _HoldToTalkMicState extends ConsumerState<HoldToTalkMic> {
  final _portal = OverlayPortalController();
  final _link = LayerLink();

  /// A long press is in progress on this button.
  var _holding = false;

  /// The finger lifted while the microphone was still starting (the system
  /// permission dialog steals the touch the first time).
  var _released = false;
  var _cancelling = false;
  var _origin = Offset.zero;

  bool get _enabled => widget.homeId != null;

  VoiceRecorderController get _controller =>
      ref.read(voiceRecorderControllerProvider.notifier);

  void _hint(String message) => widget.onHint?.call(message);

  void _setCancelling(bool value) {
    if (_cancelling == value) return;
    setState(() => _cancelling = value);
  }

  void _hideBubble() {
    if (_portal.isShowing) _portal.hide();
  }

  void _stopHolding() {
    _holding = false;
    _hideBubble();
    _setCancelling(false);
  }

  /// Hands a microphone failure to [HoldToTalkMic.onError] once.
  void _reportError() {
    final onError = widget.onError;
    if (onError == null) return;
    final error = ref.read(voiceRecorderControllerProvider).error;
    if (error == null) return;
    onError(error);
    _controller.clearError();
  }

  Future<void> _onHoldStart(LongPressStartDetails details) async {
    final homeId = widget.homeId;
    if (homeId == null) return;
    if (ref.read(assistantChatProvider(homeId)).busy) {
      _hint(MicHints.busy);
      return;
    }
    if (ref.read(voiceRecorderControllerProvider).phase != RecorderPhase.idle) {
      return;
    }
    final controller = _controller;
    _holding = true;
    _released = false;
    _origin = details.globalPosition;
    _setCancelling(false);
    unawaited(HapticFeedback.lightImpact().catchError((Object _) {}));
    if (widget.showBubble) _portal.show();

    // Checked without the system dialog, so a release before the microphone is
    // up can be explained correctly below (too short vs. permission dialog).
    final hadPermission = await ref
        .read(voiceRecorderProvider)
        .isPermissionGranted();
    if (!mounted) return;
    if (_released) {
      // Lifted during the check: never start recording with the finger up.
      _hint(MicErrors.tooShort);
      return;
    }
    await controller.start(widget.onAudio);

    if (!mounted) {
      unawaited(controller.cancel());
      return;
    }
    final recorder = ref.read(voiceRecorderControllerProvider);
    if (recorder.error != null) {
      _stopHolding();
      _reportError();
      return;
    }
    if (_released) {
      // The finger was already gone when the microphone came up: nothing is
      // sent. Either the permission dialog took the touch (first time) or the
      // hold was simply too short.
      await controller.cancel();
      if (mounted) {
        _hint(hadPermission ? MicErrors.tooShort : MicHints.granted);
      }
    }
  }

  void _onHoldMove(LongPressMoveUpdateDetails details) {
    if (!_holding) return;
    _setCancelling(
      (details.globalPosition - _origin).distance >= holdToTalkCancelDistance,
    );
  }

  Future<void> _onHoldEnd({bool forceCancel = false}) async {
    if (!_holding) return;
    final discard = forceCancel || _cancelling;
    final phase = ref.read(voiceRecorderControllerProvider).phase;
    final controller = _controller;
    _stopHolding();
    switch (phase) {
      case RecorderPhase.starting:
        _released = true;
      case RecorderPhase.recording:
        if (discard) {
          await controller.cancel();
        } else {
          await controller.stop();
          if (mounted) _reportError();
        }
      case RecorderPhase.idle:
        // Still checking the permission (recording not started yet): the
        // pending start sees this and does not record.
        _released = true;
    }
  }

  @override
  Widget build(BuildContext context) {
    // Recording ended by itself (30 s cap) or failed to start: drop the bubble.
    ref.listen(voiceRecorderControllerProvider.select((s) => s.phase), (
      _,
      phase,
    ) {
      if (phase == RecorderPhase.idle && _holding) _hideBubble();
    });
    final recorder = ref.watch(voiceRecorderControllerProvider);
    final homeId = widget.homeId;
    final busy = homeId != null
        ? ref.watch(assistantChatProvider(homeId).select((s) => s.busy))
        : false;

    final button = MicButton(
      phase: recorder.phase,
      busy: busy,
      cancelling: _cancelling && _holding,
      enabled: _enabled,
      size: widget.size,
      shadow: widget.shadow,
    );

    return Semantics(
      button: true,
      enabled: _enabled,
      label: widget.semanticLabel,
      onTap: _enabled ? widget.onTap : null,
      child: OverlayPortal(
        controller: _portal,
        overlayChildBuilder: _bubbleBuilder,
        child: CompositedTransformTarget(
          link: _link,
          child: RawGestureDetector(
            behavior: HitTestBehavior.opaque,
            gestures: {
              TapGestureRecognizer:
                  GestureRecognizerFactoryWithHandlers<TapGestureRecognizer>(
                    TapGestureRecognizer.new,
                    (recognizer) =>
                        recognizer.onTap = _enabled ? widget.onTap : null,
                  ),
              LongPressGestureRecognizer:
                  GestureRecognizerFactoryWithHandlers<
                    LongPressGestureRecognizer
                  >(
                    () => LongPressGestureRecognizer(duration: holdToTalkDelay),
                    (recognizer) {
                      recognizer
                        ..onLongPressStart = _enabled ? _onHoldStart : null
                        ..onLongPressMoveUpdate = _enabled ? _onHoldMove : null
                        ..onLongPressEnd = _enabled
                            ? (_) => unawaited(_onHoldEnd())
                            : null
                        ..onLongPressCancel = _enabled
                            ? () => unawaited(_onHoldEnd(forceCancel: true))
                            : null;
                    },
                  ),
            },
            child: button,
          ),
        ),
      ),
    );
  }

  Widget _bubbleBuilder(BuildContext context) {
    return Positioned(
      left: 0,
      top: 0,
      child: CompositedTransformFollower(
        link: _link,
        targetAnchor: Alignment.topCenter,
        followerAnchor: Alignment.bottomCenter,
        offset: const Offset(0, -24),
        child: IgnorePointer(
          child: Consumer(
            builder: (context, ref, _) {
              final recorder = ref.watch(voiceRecorderControllerProvider);
              return _ListeningBubble(
                phase: recorder.phase,
                seconds: recorder.seconds,
                cancelling: _cancelling,
              );
            },
          ),
        ),
      ),
    );
  }
}

/// "Đang nghe… 0:04 / 0:30 — Thả tay để gửi · Kéo lên để huỷ".
class _ListeningBubble extends StatelessWidget {
  const _ListeningBubble({
    required this.phase,
    required this.seconds,
    required this.cancelling,
  });

  final RecorderPhase phase;
  final int seconds;
  final bool cancelling;

  @override
  Widget build(BuildContext context) {
    final starting = phase != RecorderPhase.recording;
    final title = starting
        ? 'Đang chuẩn bị micro…'
        : 'Đang nghe… ${formatRecordClock(seconds)} / '
              '${formatRecordClock(maxRecordSeconds)}';
    final hint = starting
        ? ''
        : cancelling
        ? 'Thả tay để huỷ'
        : 'Thả tay để gửi · Kéo lên để huỷ';
    return Material(
      key: const ValueKey('hold-bubble'),
      color: cancelling ? AppColors.textSecondary : AppColors.textPrimary,
      elevation: 6,
      borderRadius: BorderRadius.circular(16),
      child: ConstrainedBox(
        constraints: const BoxConstraints(maxWidth: 300),
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Text(
                title,
                key: const ValueKey('hold-bubble-title'),
                textAlign: TextAlign.center,
                style: const TextStyle(
                  color: Colors.white,
                  fontWeight: FontWeight.w700,
                  fontSize: 14,
                ),
              ),
              if (hint.isNotEmpty)
                Text(
                  hint,
                  key: const ValueKey('hold-bubble-hint'),
                  textAlign: TextAlign.center,
                  style: const TextStyle(color: Colors.white70, fontSize: 12),
                ),
            ],
          ),
        ),
      ),
    );
  }
}
