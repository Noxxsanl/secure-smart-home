/// Wall-clock helpers in a Smart Home's timezone (FR-5.10 schedules and the
/// AI assistant's replies).
///
/// A schedule runs at the time the user typed "in the home" (`Home.timezone`,
/// an IANA name, default `Asia/Ho_Chi_Minh`) — never in the phone's timezone.
/// Dart ships no IANA database, so only zones without daylight saving are
/// mapped to a fixed UTC offset ([fixedUtcOffsets]); any other zone falls back
/// to the phone's local time and [HomeClock.isExact] is `false` (the UI may add
/// "(giờ điện thoại)"). Same wording as the web (`@shh/automation`
/// model/scheduledAction.ts `formatRunAt`).
library;

import 'date_format.dart' show twoDigits;

/// Timezone of a home created without one (database default).
const defaultHomeTimezone = 'Asia/Ho_Chi_Minh';

/// IANA zones without daylight saving time → UTC offset.
const fixedUtcOffsets = <String, Duration>{
  'Asia/Ho_Chi_Minh': Duration(hours: 7),
  'Asia/Saigon': Duration(hours: 7),
  'Asia/Bangkok': Duration(hours: 7),
  'Asia/Jakarta': Duration(hours: 7),
  'Asia/Phnom_Penh': Duration(hours: 7),
  'Asia/Vientiane': Duration(hours: 7),
  'Asia/Singapore': Duration(hours: 8),
  'Asia/Kuala_Lumpur': Duration(hours: 8),
  'Asia/Manila': Duration(hours: 8),
  'Asia/Shanghai': Duration(hours: 8),
  'Asia/Hong_Kong': Duration(hours: 8),
  'Asia/Taipei': Duration(hours: 8),
  'Asia/Tokyo': Duration(hours: 9),
  'Asia/Seoul': Duration(hours: 9),
  'UTC': Duration.zero,
  'Etc/UTC': Duration.zero,
};

/// Calendar fields of an instant as seen in the home.
class HomeTimeParts {
  const HomeTimeParts({
    required this.dayKey,
    required this.hour,
    required this.minute,
    required this.second,
  });

  /// `YYYY-MM-DD` (the format the schedules API takes in `when.date`).
  final String dayKey;
  final int hour;
  final int minute;
  final int second;

  /// `HH:MM` (the format the schedules API takes in `when.at`).
  String get hhmm => '${twoDigits(hour)}:${twoDigits(minute)}';

  int get secondOfDay => hour * 3600 + minute * 60 + second;
}

/// Reads instants on the wall clock of one home.
class HomeClock {
  /// [timezone] is the home's IANA name; `null`/blank means
  /// [defaultHomeTimezone].
  factory HomeClock(String? timezone) {
    final trimmed = timezone?.trim() ?? '';
    final zone = trimmed.isEmpty ? defaultHomeTimezone : trimmed;
    return HomeClock._(zone, fixedUtcOffsets[zone]);
  }

  const HomeClock._(this.timezone, this._offset);

  final String timezone;
  final Duration? _offset;

  /// `false` when [timezone] is not in [fixedUtcOffsets] and times are shown
  /// in the phone's local time instead.
  bool get isExact => _offset != null;

  /// Fields of [instant] in the home.
  HomeTimeParts partsOf(DateTime instant) {
    final offset = _offset;
    final shifted = offset == null
        ? instant.toLocal()
        : instant.toUtc().add(offset);
    return HomeTimeParts(
      dayKey: _dayKey(shifted.year, shifted.month, shifted.day),
      hour: shifted.hour,
      minute: shifted.minute,
      second: shifted.second,
    );
  }

  /// `YYYY-MM-DD` of [now] in the home.
  String todayKey(DateTime now) => partsOf(now).dayKey;

  /// `HH:MM` of [instant] in the home.
  String hhmm(DateTime instant) => partsOf(instant).hhmm;

  /// "20:00 hôm nay" / "20:00 ngày mai" / "20:00 hôm qua" / "20:00 · 16/11".
  String formatRunAt(DateTime instant, {required DateTime now}) {
    final run = partsOf(instant);
    return composeWhen(run.hhmm, run.dayKey, todayKey(now));
  }
}

/// Adds [days] to a `YYYY-MM-DD` key (Gregorian calendar, timezone-free).
String addDaysToKey(String dayKey, int days) {
  final parts = dayKey.split('-').map(int.parse).toList(growable: false);
  final date = DateTime.utc(parts[0], parts[1], parts[2] + days);
  return _dayKey(date.year, date.month, date.day);
}

/// "hôm nay" / "ngày mai" / "hôm qua" / "16/11" for [dayKey] seen from
/// [todayKey].
String dayLabel(String dayKey, String todayKey) {
  if (dayKey == todayKey) return 'hôm nay';
  if (dayKey == addDaysToKey(todayKey, 1)) return 'ngày mai';
  if (dayKey == addDaysToKey(todayKey, -1)) return 'hôm qua';
  final parts = dayKey.split('-');
  return '${parts[2]}/${parts[1]}';
}

/// "20:00 hôm nay" / "20:00 ngày mai" / "20:00 · 16/11" (further away).
String composeWhen(String hhmm, String dayKey, String todayKey) {
  final label = dayLabel(dayKey, todayKey);
  return label.contains('/') ? '$hhmm · $label' : '$hhmm $label';
}

String _dayKey(int year, int month, int day) =>
    '${year.toString().padLeft(4, '0')}-${twoDigits(month)}-${twoDigits(day)}';
