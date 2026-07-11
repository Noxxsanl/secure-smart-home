import 'dart:math' as math;

import 'package:flutter/material.dart';

import '../../../../core/theme/app_theme.dart';

/// A speedometer-style dial used to display and (optionally) adjust a
/// bounded numeric value, e.g. a target temperature.
class CircularGauge extends StatelessWidget {
  const CircularGauge({
    super.key,
    required this.value,
    required this.min,
    required this.max,
    this.onChanged,
    this.size = 220,
    this.child,
  });

  final double value;
  final double min;
  final double max;
  final ValueChanged<double>? onChanged;
  final double size;
  final Widget? child;

  static const _startAngle = 135 * math.pi / 180;
  static const _sweepAngle = 270 * math.pi / 180;

  void _handleTouch(Offset localPosition) {
    final onChanged = this.onChanged;
    if (onChanged == null) return;

    final center = Offset(size / 2, size / 2);
    final delta = localPosition - center;
    var angle = math.atan2(delta.dy, delta.dx);
    if (angle < _startAngle) angle += 2 * math.pi;

    final relative = angle - _startAngle;
    if (relative < 0 || relative > _sweepAngle) return;

    final fraction = (relative / _sweepAngle).clamp(0.0, 1.0);
    onChanged(min + fraction * (max - min));
  }

  @override
  Widget build(BuildContext context) {
    final fraction = ((value - min) / (max - min)).clamp(0.0, 1.0);

    return GestureDetector(
      onPanUpdate: (details) => _handleTouch(details.localPosition),
      onTapDown: (details) => _handleTouch(details.localPosition),
      child: SizedBox(
        width: size,
        height: size,
        child: CustomPaint(
          painter: _GaugePainter(fraction: fraction),
          child: Center(child: child),
        ),
      ),
    );
  }
}

class _GaugePainter extends CustomPainter {
  _GaugePainter({required this.fraction});

  final double fraction;

  @override
  void paint(Canvas canvas, Size size) {
    final center = Offset(size.width / 2, size.height / 2);
    final radius = size.width / 2 - 10;
    const startAngle = CircularGauge._startAngle;
    const sweepAngle = CircularGauge._sweepAngle;

    final trackPaint = Paint()
      ..color = AppColors.track
      ..strokeWidth = 12
      ..strokeCap = StrokeCap.round
      ..style = PaintingStyle.stroke;

    final valuePaint = Paint()
      ..color = AppColors.primary
      ..strokeWidth = 12
      ..strokeCap = StrokeCap.round
      ..style = PaintingStyle.stroke;

    canvas.drawArc(
      Rect.fromCircle(center: center, radius: radius),
      startAngle,
      sweepAngle,
      false,
      trackPaint,
    );

    canvas.drawArc(
      Rect.fromCircle(center: center, radius: radius),
      startAngle,
      sweepAngle * fraction,
      false,
      valuePaint,
    );

    final handleAngle = startAngle + sweepAngle * fraction;
    final handleCenter = Offset(
      center.dx + radius * math.cos(handleAngle),
      center.dy + radius * math.sin(handleAngle),
    );

    canvas.drawCircle(handleCenter, 14, Paint()..color = Colors.white);
    canvas.drawCircle(
      handleCenter,
      14,
      Paint()
        ..color = AppColors.primary
        ..strokeWidth = 4
        ..style = PaintingStyle.stroke,
    );
  }

  @override
  bool shouldRepaint(covariant _GaugePainter oldDelegate) =>
      oldDelegate.fraction != fraction;
}
