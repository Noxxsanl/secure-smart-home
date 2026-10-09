/// Small Vietnamese date/number helpers (no `intl` dependency).
/// Every function converts to local time before formatting.
library;

String twoDigits(int value) => value.toString().padLeft(2, '0');

const _weekdayNames = [
  'Thứ Hai',
  'Thứ Ba',
  'Thứ Tư',
  'Thứ Năm',
  'Thứ Sáu',
  'Thứ Bảy',
  'Chủ nhật',
];

/// ISO weekday (1 = Monday … 7 = Sunday) → "Thứ Hai" … "Chủ nhật".
String weekdayName(int isoWeekday) => _weekdayNames[(isoWeekday - 1) % 7];

/// ISO weekday → short label used in schedules: "T2" … "T7", "CN".
String shortWeekday(int isoWeekday) =>
    isoWeekday == 7 ? 'CN' : 'T${isoWeekday + 1}';

/// "21:05"
String formatTime(DateTime value) {
  final local = value.toLocal();
  return '${twoDigits(local.hour)}:${twoDigits(local.minute)}';
}

/// "04/10/2026"
String formatDate(DateTime value) {
  final local = value.toLocal();
  return '${twoDigits(local.day)}/${twoDigits(local.month)}/${local.year}';
}

/// "04/10"
String formatShortDate(DateTime value) {
  final local = value.toLocal();
  return '${twoDigits(local.day)}/${twoDigits(local.month)}';
}

/// "21:05 04/10/2026"
String formatDateTime(DateTime value) =>
    '${formatTime(value)} ${formatDate(value)}';

/// "Thứ Bảy, 4 tháng 10"
String formatLongDate(DateTime value) {
  final local = value.toLocal();
  return '${weekdayName(local.weekday)}, ${local.day} tháng ${local.month}';
}

/// Relative time in Vietnamese: "vừa xong", "5 phút trước", "3 giờ trước",
/// "hôm qua lúc 21:30", "4 ngày trước", then a plain date.
String formatRelative(DateTime value, {DateTime? now}) {
  final local = value.toLocal();
  final current = (now ?? DateTime.now()).toLocal();
  final difference = current.difference(local);

  if (difference.isNegative) {
    return difference.inSeconds > -60 ? 'vừa xong' : formatDateTime(local);
  }
  if (difference.inSeconds < 60) return 'vừa xong';

  final today = DateTime(current.year, current.month, current.day);
  final day = DateTime(local.year, local.month, local.day);
  final dayDifference = (today.difference(day).inHours / 24).round();

  if (difference.inMinutes < 60) return '${difference.inMinutes} phút trước';
  if (dayDifference == 0) return '${difference.inHours} giờ trước';
  if (dayDifference == 1) return 'hôm qua lúc ${formatTime(local)}';
  if (dayDifference < 7) return '$dayDifference ngày trước';
  return formatDate(local);
}

/// FR-5.5: "Online lần cuối 5 phút trước".
String formatLastOnline(DateTime? lastSeen, {DateTime? now}) {
  if (lastSeen == null) return 'Chưa từng kết nối';
  return 'Online lần cuối ${formatRelative(lastSeen, now: now)}';
}

/// Vietnamese decimal comma: 28.4 → "28,4", 30.0 → "30".
String formatNumber(double value, {int fractionDigits = 1}) {
  final fixed = value.toStringAsFixed(fractionDigits);
  var text = fixed;
  if (text.contains('.')) {
    text = text.replaceFirst(RegExp(r'0+$'), '');
    if (text.endsWith('.')) text = text.substring(0, text.length - 1);
  }
  if (text == '-0') text = '0';
  return text.replaceAll('.', ',');
}

/// "28,4°C" or "--" when unknown.
String formatTemperature(double? value) =>
    value == null ? '--' : '${formatNumber(value)}°C';

/// "65%" or "--" when unknown.
String formatHumidity(double? value) =>
    value == null ? '--' : '${formatNumber(value, fractionDigits: 0)}%';
