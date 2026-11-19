import 'package:flutter/foundation.dart';

import '../../../core/utils/home_time.dart';
import '../../devices/devices.dart' show ApplianceKind, CustomerDevice;
import 'schedule.dart';

// Form logic of the one-off schedule (FR-5.10), the same rules as the web
// (`@shh/automation` model/scheduledAction.ts): which operations each appliance
// offers, the limits, and how "Lúc HH:MM [ngày]" / "Sau N phút" turn into the
// `when` the backend takes. Pure functions that receive `now`, so tests can pin
// the clock.

const scheduleTempMin = 16;
const scheduleTempMax = 30;
const scheduleTempDefault = 26;
const scheduleAfterMin = 1;
const scheduleAfterMax = 10080; // 7 days
const scheduleAfterPresets = <int>[5, 15, 30, 60];

/// Farthest a schedule may be set (7 days) and nearest ("lần tới" skips a time
/// that is less than 30 s away) — same bounds as the backend.
const scheduleMaxAhead = Duration(minutes: scheduleAfterMax);
const scheduleMinAhead = Duration(seconds: 30);

/// One operation offered for an appliance in the form.
@immutable
class ScheduleChoice {
  const ScheduleChoice({
    required this.key,
    required this.label,
    required this.action,
    this.position,
    this.needsTemperature = false,
  });

  /// Unique within one appliance kind.
  final String key;
  final String label;
  final ScheduleAction action;

  /// `set_pos` target, 0 = closed.
  final int? position;

  /// Air conditioner "Đặt nhiệt độ": shows the 16–30 °C field.
  final bool needsTemperature;
}

const _onOff = [
  ScheduleChoice(key: 'on', label: 'Bật', action: ScheduleAction.turnOn),
  ScheduleChoice(key: 'off', label: 'Tắt', action: ScheduleAction.turnOff),
];

/// Operations that suit the appliance — the backend's table (a wrong type is
/// `400 NOT_CONTROLLABLE`). Empty for anything it cannot schedule.
List<ScheduleChoice> scheduleChoicesFor(ApplianceKind? kind) => switch (kind) {
  ApplianceKind.lamp || ApplianceKind.fan => _onOff,
  ApplianceKind.curtain => const [
    ScheduleChoice(
      key: 'pos100',
      label: 'Mở hết',
      action: ScheduleAction.setPos,
      position: 100,
    ),
    ScheduleChoice(
      key: 'pos50',
      label: 'Mở 50%',
      action: ScheduleAction.setPos,
      position: 50,
    ),
    ScheduleChoice(
      key: 'pos0',
      label: 'Đóng',
      action: ScheduleAction.setPos,
      position: 0,
    ),
  ],
  ApplianceKind.airConditioner => const [
    ..._onOff,
    ScheduleChoice(
      key: 'temp',
      label: 'Đặt nhiệt độ',
      action: ScheduleAction.setTemp,
      needsTemperature: true,
    ),
  ],
  _ => const [],
};

/// Relays the form can schedule: lamp / fan / curtain / air conditioner that the
/// backend classified, and the account may control. Not required online (the
/// backend checks when the schedule runs, not when it is created).
List<CustomerDevice> schedulableDevices(Iterable<CustomerDevice> devices) => [
  for (final device in devices)
    if (device.isSchedulable) device,
];

// ---- `when` -----------------------------------------------------------------

/// `when` of `POST /homes/:id/schedules`: exactly one of two shapes.
@immutable
sealed class ScheduleWhen {
  const ScheduleWhen();

  Map<String, Object> toJson();
}

/// "Lúc HH:MM" in the home's timezone. Without [date] it means "next time":
/// the backend picks today or tomorrow.
@immutable
final class ScheduleAt extends ScheduleWhen {
  const ScheduleAt(this.time, {this.date});

  /// `HH:MM`.
  final String time;

  /// `YYYY-MM-DD`, or `null` for "lần tới".
  final String? date;

  @override
  Map<String, Object> toJson() => {'at': time, 'date': ?date};

  @override
  bool operator ==(Object other) =>
      other is ScheduleAt && other.time == time && other.date == date;

  @override
  int get hashCode => Object.hash(time, date);
}

/// "Sau N phút" (1..10 080).
@immutable
final class ScheduleAfter extends ScheduleWhen {
  const ScheduleAfter(this.minutes);

  final int minutes;

  @override
  Map<String, Object> toJson() => {'after_minutes': minutes};

  @override
  bool operator ==(Object other) =>
      other is ScheduleAfter && other.minutes == minutes;

  @override
  int get hashCode => minutes.hashCode;
}

/// Body of `POST /homes/:id/schedules`.
@immutable
class ScheduleInput {
  const ScheduleInput({
    required this.deviceId,
    required this.action,
    required this.when,
    this.temperature,
    this.position,
  });

  final int deviceId;
  final ScheduleAction action;
  final int? temperature;

  /// `set_pos` target; 0 (closed) must still be sent.
  final int? position;
  final ScheduleWhen when;

  Map<String, Object> toJson() => {
    'device_id': deviceId,
    'action': action.apiValue,
    'temperature': ?temperature,
    'position': ?position,
    'when': when.toJson(),
  };
}

// ---- Form ------------------------------------------------------------------

enum WhenMode { at, after }

enum DateChoice {
  next('Lần tới'),
  tomorrow('Ngày mai'),
  pick('Chọn ngày');

  const DateChoice(this.label);

  final String label;
}

/// What the "thời điểm" part of the form holds.
@immutable
class WhenDraft {
  const WhenDraft({
    this.mode = WhenMode.at,
    this.time = '',
    this.dateChoice = DateChoice.next,
    this.pickedDate = '',
    this.afterMinutes = '30',
  });

  final WhenMode mode;

  /// `HH:MM`.
  final String time;
  final DateChoice dateChoice;

  /// `YYYY-MM-DD`, only used when [dateChoice] is [DateChoice.pick].
  final String pickedDate;

  /// Typed or picked minutes.
  final String afterMinutes;

  WhenDraft copyWith({
    WhenMode? mode,
    String? time,
    DateChoice? dateChoice,
    String? pickedDate,
    String? afterMinutes,
  }) => WhenDraft(
    mode: mode ?? this.mode,
    time: time ?? this.time,
    dateChoice: dateChoice ?? this.dateChoice,
    pickedDate: pickedDate ?? this.pickedDate,
    afterMinutes: afterMinutes ?? this.afterMinutes,
  );
}

final _timePattern = RegExp(r'^([01]\d|2[0-3]):[0-5]\d$');
final _datePattern = RegExp(r'^\d{4}-\d{2}-\d{2}$');
final _digits = RegExp(r'^\d+$');

bool isValidScheduleTime(String value) => _timePattern.hasMatch(value);

bool isValidScheduleDate(String value) {
  if (!_datePattern.hasMatch(value)) return false;
  final parts = value.split('-').map(int.parse).toList(growable: false);
  final date = DateTime.utc(parts[0], parts[1], parts[2]);
  return date.month == parts[1] && date.day == parts[2];
}

/// Integer 1..10 080 from the minutes field; `null` while it is not valid.
int? parseAfterMinutes(String value) {
  final text = value.trim();
  if (!_digits.hasMatch(text)) return null;
  final minutes = int.tryParse(text);
  if (minutes == null) return null;
  return minutes >= scheduleAfterMin && minutes <= scheduleAfterMax
      ? minutes
      : null;
}

/// Integer 16..30 from the set point field; `null` while it is not valid.
int? parseScheduleTemperature(String value) {
  final text = value.trim();
  if (!_digits.hasMatch(text)) return null;
  final temperature = int.tryParse(text);
  if (temperature == null) return null;
  return temperature >= scheduleTempMin && temperature <= scheduleTempMax
      ? temperature
      : null;
}

/// Initial time of the form: now + 30 minutes on the home's wall clock
/// (`HH:MM`).
String defaultScheduleTime(HomeClock clock, DateTime now) =>
    clock.hhmm(now.add(const Duration(minutes: 30)));

/// The `when` to send, or `null` while the form is incomplete/invalid. "Lần tới"
/// carries no `date` (the backend picks today or tomorrow); "Ngày mai" is the
/// home's tomorrow.
ScheduleWhen? buildWhen(WhenDraft draft, HomeClock clock, DateTime now) {
  if (draft.mode == WhenMode.after) {
    final minutes = parseAfterMinutes(draft.afterMinutes);
    return minutes == null ? null : ScheduleAfter(minutes);
  }
  if (!isValidScheduleTime(draft.time)) return null;
  switch (draft.dateChoice) {
    case DateChoice.next:
      return ScheduleAt(draft.time);
    case DateChoice.tomorrow:
      return ScheduleAt(draft.time, date: addDaysToKey(clock.todayKey(now), 1));
    case DateChoice.pick:
      return isValidScheduleDate(draft.pickedDate)
          ? ScheduleAt(draft.time, date: draft.pickedDate)
          : null;
  }
}

/// The instant [when] stands for, the way the backend converts it: "lần tới"
/// is today, or tomorrow when that time is less than 30 s ahead; times are read
/// on the home's wall clock. [when] must be well-formed (see [buildWhen]).
DateTime resolveRunAt(ScheduleWhen when, HomeClock clock, DateTime now) {
  switch (when) {
    case ScheduleAfter(:final minutes):
      return now.toUtc().add(Duration(minutes: minutes));
    case ScheduleAt(:final time, :final date):
      final nowParts = clock.partsOf(now);
      final hour = int.parse(time.substring(0, 2));
      final minute = int.parse(time.substring(3, 5));
      var dayKey = date ?? nowParts.dayKey;
      if (date == null &&
          hour * 3600 + minute * 60 <
              nowParts.secondOfDay + scheduleMinAhead.inSeconds) {
        dayKey = addDaysToKey(dayKey, 1);
      }
      return _instantAt(clock, dayKey, hour, minute, now);
  }
}

/// Wall-clock `dayKey hour:minute` of the home → UTC instant. The home's UTC
/// offset is read off [reference] through [HomeClock.partsOf] (no timezone
/// database is available).
DateTime _instantAt(
  HomeClock clock,
  String dayKey,
  int hour,
  int minute,
  DateTime reference,
) {
  final ref = reference.toUtc();
  final parts = clock.partsOf(ref);
  final refDay = parts.dayKey.split('-').map(int.parse).toList(growable: false);
  final wallAsUtc = DateTime.utc(
    refDay[0],
    refDay[1],
    refDay[2],
    parts.hour,
    parts.minute,
    parts.second,
  );
  final offset = wallAsUtc.difference(
    DateTime.utc(
      ref.year,
      ref.month,
      ref.day,
      ref.hour,
      ref.minute,
      ref.second,
    ),
  );
  final day = dayKey.split('-').map(int.parse).toList(growable: false);
  return DateTime.utc(day[0], day[1], day[2], hour, minute).subtract(offset);
}

/// "Sẽ chạy: …" line — "20:00 hôm nay" / "20:00 ngày mai" / "20:00 · 16/11".
/// Only a preview; the backend decides the real `run_at`.
String? previewWhen(ScheduleWhen? when, HomeClock clock, DateTime now) {
  if (when == null) return null;
  return clock.formatRunAt(resolveRunAt(when, clock, now), now: now);
}
