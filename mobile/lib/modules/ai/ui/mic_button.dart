import 'package:flutter/material.dart';

import '../../../core/theme/app_theme.dart';
import '../domain/voice_recorder.dart';

/// Round mic button, display only: the gesture (tap / hold to talk) belongs to
/// `HoldToTalkMic`. Red with a pulsing ring while recording, grey when the
/// finger is far enough away that releasing would cancel, a spinner while the
/// microphone starts or the Assistant is answering.
class MicButton extends StatefulWidget {
  const MicButton({
    super.key,
    required this.phase,
    required this.busy,
    this.cancelling = false,
    this.enabled = true,
    this.size = 56,
    this.shadow = false,
  });

  final RecorderPhase phase;

  /// Waiting for the Assistant's answer.
  final bool busy;

  /// The finger is far from the button: releasing now throws the recording away.
  final bool cancelling;

  /// `false` when there is no home to talk about.
  final bool enabled;
  final double size;

  /// Soft shadow under the button (the one in the navigation bar).
  final bool shadow;

  @override
  State<MicButton> createState() => _MicButtonState();
}

class _MicButtonState extends State<MicButton>
    with SingleTickerProviderStateMixin {
  late final AnimationController _pulse;

  bool get _recording => widget.phase == RecorderPhase.recording;

  @override
  void initState() {
    super.initState();
    _pulse = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 1100),
    );
    if (_recording) _pulse.repeat();
  }

  @override
  void didUpdateWidget(MicButton oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (_recording && !_pulse.isAnimating) {
      _pulse.repeat();
    } else if (!_recording && _pulse.isAnimating) {
      _pulse
        ..stop()
        ..value = 0;
    }
  }

  @override
  void dispose() {
    _pulse.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final waiting = widget.phase == RecorderPhase.starting || widget.busy;
    final color = !widget.enabled
        ? AppColors.offline
        : widget.cancelling
        ? AppColors.textSecondary
        : _recording
        ? AppColors.critical
        : AppColors.primary;
    final size = widget.size;

    return SizedBox(
      width: size,
      height: size,
      child: Stack(
        alignment: Alignment.center,
        clipBehavior: Clip.none,
        children: [
          if (_recording)
            IgnorePointer(
              child: AnimatedBuilder(
                animation: _pulse,
                builder: (context, _) => Opacity(
                  opacity: (1 - _pulse.value) * 0.45,
                  child: Container(
                    width: size * (1 + 0.45 * _pulse.value),
                    height: size * (1 + 0.45 * _pulse.value),
                    decoration: BoxDecoration(
                      shape: BoxShape.circle,
                      color: color,
                    ),
                  ),
                ),
              ),
            ),
          Container(
            width: size,
            height: size,
            decoration: BoxDecoration(
              shape: BoxShape.circle,
              color: color,
              boxShadow: [
                BoxShadow(
                  color: Colors.black.withValues(
                    alpha: widget.shadow ? 0.22 : 0.12,
                  ),
                  blurRadius: widget.shadow ? 12 : 4,
                  offset: Offset(0, widget.shadow ? 4 : 2),
                ),
              ],
            ),
            child: Center(
              child: waiting
                  ? SizedBox(
                      width: size * 0.42,
                      height: size * 0.42,
                      child: const CircularProgressIndicator(
                        strokeWidth: 2.5,
                        color: Colors.white,
                      ),
                    )
                  : Icon(
                      widget.cancelling ? Icons.close_rounded : Icons.mic,
                      color: Colors.white,
                      size: size * 0.5,
                    ),
            ),
          ),
        ],
      ),
    );
  }
}
