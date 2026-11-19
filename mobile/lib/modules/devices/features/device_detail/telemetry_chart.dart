import 'dart:math' as math;

import 'package:flutter/material.dart';

import '../../../../core/theme/app_theme.dart';
import '../../../../core/utils/date_format.dart';
import '../../domain/device.dart';

/// Line chart of one metric over 24 h / 7 d (FR-5.4), drawn with a
/// [CustomPainter] (no chart package). Missing samples leave gaps.
class TelemetryChart extends StatelessWidget {
  const TelemetryChart({
    super.key,
    required this.title,
    required this.unit,
    required this.color,
    required this.times,
    required this.values,
    required this.range,
    this.fractionDigits = 1,
  });

  final String title;
  final String unit;
  final Color color;
  final List<DateTime> times;
  final List<double?> values;
  final TelemetryRange range;
  final int fractionDigits;

  @override
  Widget build(BuildContext context) {
    final present = values.whereType<double>().toList();
    final hasData = present.isNotEmpty;
    final minValue = hasData ? present.reduce(math.min) : 0.0;
    final maxValue = hasData ? present.reduce(math.max) : 0.0;
    final average = hasData
        ? present.reduce((a, b) => a + b) / present.length
        : 0.0;

    String fmt(double value) =>
        '${formatNumber(value, fractionDigits: fractionDigits)}$unit';

    return Container(
      padding: const EdgeInsets.fromLTRB(16, 14, 16, 12),
      decoration: BoxDecoration(
        color: AppColors.surface,
        borderRadius: BorderRadius.circular(24),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Container(
                width: 10,
                height: 10,
                decoration: BoxDecoration(color: color, shape: BoxShape.circle),
              ),
              const SizedBox(width: 8),
              Text(
                title,
                style: const TextStyle(
                  fontWeight: FontWeight.bold,
                  color: AppColors.textPrimary,
                ),
              ),
              const Spacer(),
              if (hasData)
                Text(
                  'Thấp ${fmt(minValue)} · TB ${fmt(average)} · Cao ${fmt(maxValue)}',
                  style: const TextStyle(
                    fontSize: 11,
                    color: AppColors.textSecondary,
                  ),
                ),
            ],
          ),
          const SizedBox(height: 10),
          SizedBox(
            height: 150,
            width: double.infinity,
            child: hasData
                ? CustomPaint(
                    painter: _ChartPainter(
                      values: values,
                      times: times,
                      color: color,
                      range: range,
                      fractionDigits: fractionDigits,
                    ),
                  )
                : const Center(
                    child: Text(
                      'Chưa có số liệu trong khoảng này.',
                      style: TextStyle(color: AppColors.textSecondary),
                    ),
                  ),
          ),
        ],
      ),
    );
  }
}

class _ChartPainter extends CustomPainter {
  _ChartPainter({
    required this.values,
    required this.times,
    required this.color,
    required this.range,
    required this.fractionDigits,
  });

  final List<double?> values;
  final List<DateTime> times;
  final Color color;
  final TelemetryRange range;
  final int fractionDigits;

  static const _left = 34.0;
  static const _right = 6.0;
  static const _top = 6.0;
  static const _bottom = 20.0;

  void _text(
    Canvas canvas,
    String text,
    Offset offset, {
    TextAlign align = TextAlign.left,
  }) {
    final painter = TextPainter(
      text: TextSpan(
        text: text,
        style: const TextStyle(fontSize: 10, color: AppColors.textSecondary),
      ),
      textDirection: TextDirection.ltr,
      textAlign: align,
    )..layout();
    final dx = align == TextAlign.right ? offset.dx - painter.width : offset.dx;
    painter.paint(canvas, Offset(dx, offset.dy));
  }

  @override
  void paint(Canvas canvas, Size size) {
    final plot = Rect.fromLTRB(
      _left,
      _top,
      size.width - _right,
      size.height - _bottom,
    );
    final present = values.whereType<double>();
    var low = present.reduce(math.min);
    var high = present.reduce(math.max);
    if (high - low < 1) {
      low -= 0.5;
      high += 0.5;
    }
    final pad = (high - low) * 0.1;
    low -= pad;
    high += pad;

    final gridPaint = Paint()
      ..color = AppColors.track
      ..strokeWidth = 1;
    for (var i = 0; i < 3; i++) {
      final y = plot.top + plot.height * i / 2;
      canvas.drawLine(Offset(plot.left, y), Offset(plot.right, y), gridPaint);
      final value = high - (high - low) * i / 2;
      _text(
        canvas,
        formatNumber(value, fractionDigits: fractionDigits),
        Offset(plot.left - 4, y - 6),
        align: TextAlign.right,
      );
    }

    final count = values.length;
    final dx = count > 1 ? plot.width / (count - 1) : 0.0;
    double xAt(int i) => plot.left + dx * i;
    double yAt(double v) => plot.bottom - (v - low) / (high - low) * plot.height;

    final linePaint = Paint()
      ..color = color
      ..style = PaintingStyle.stroke
      ..strokeWidth = 2
      ..strokeJoin = StrokeJoin.round
      ..strokeCap = StrokeCap.round;
    final fillPaint = Paint()
      ..shader = LinearGradient(
        begin: Alignment.topCenter,
        end: Alignment.bottomCenter,
        colors: [color.withValues(alpha: 0.22), color.withValues(alpha: 0.0)],
      ).createShader(plot);

    // Contiguous runs of non-null values become separate segments.
    var i = 0;
    while (i < count) {
      if (values[i] == null) {
        i++;
        continue;
      }
      final line = Path()..moveTo(xAt(i), yAt(values[i]!));
      var end = i;
      while (end + 1 < count && values[end + 1] != null) {
        end++;
        line.lineTo(xAt(end), yAt(values[end]!));
      }
      if (end > i) {
        final fill = Path.from(line)
          ..lineTo(xAt(end), plot.bottom)
          ..lineTo(xAt(i), plot.bottom)
          ..close();
        canvas.drawPath(fill, fillPaint);
        canvas.drawPath(line, linePaint);
      } else {
        canvas.drawCircle(Offset(xAt(i), yAt(values[i]!)), 2.5, Paint()..color = color);
      }
      i = end + 1;
    }

    // Time labels: start, middle, end.
    if (times.length >= 2) {
      String label(DateTime t) => range == TelemetryRange.last24Hours
          ? formatTime(t)
          : formatShortDate(t);
      _text(canvas, label(times.first), Offset(plot.left, plot.bottom + 4));
      final mid = times[times.length ~/ 2];
      _text(
        canvas,
        label(mid),
        Offset(plot.left + plot.width / 2 - 14, plot.bottom + 4),
      );
      _text(
        canvas,
        label(times.last),
        Offset(plot.right, plot.bottom + 4),
        align: TextAlign.right,
      );
    }
  }

  @override
  bool shouldRepaint(covariant _ChartPainter oldDelegate) =>
      oldDelegate.values != values ||
      oldDelegate.color != color ||
      oldDelegate.range != range;
}
