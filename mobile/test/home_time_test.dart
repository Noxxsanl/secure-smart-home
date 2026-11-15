import 'package:flutter_test/flutter_test.dart';
import 'package:smart_home_mobile/core/utils/home_time.dart';

void main() {
  group('HomeClock', () {
    final clock = HomeClock('Asia/Ho_Chi_Minh');
    // 12:00 in Hà Nội.
    final now = DateTime.utc(2026, 11, 15, 5);

    test('reads instants on the home wall clock, not the phone', () {
      expect(clock.isExact, isTrue);
      final parts = clock.partsOf(DateTime.utc(2026, 11, 15, 13, 5, 9));
      expect(parts.dayKey, '2026-11-15');
      expect(parts.hhmm, '20:05');
      expect(parts.secondOfDay, 20 * 3600 + 5 * 60 + 9);
      expect(clock.todayKey(now), '2026-11-15');
    });

    test('formats run times like the web', () {
      expect(
        clock.formatRunAt(DateTime.utc(2026, 11, 15, 13), now: now),
        '20:00 hôm nay',
      );
      // 00:30 on 16/11 in the home is "tomorrow" even though it is still
      // 15/11 in UTC.
      expect(
        clock.formatRunAt(DateTime.utc(2026, 11, 15, 17, 30), now: now),
        '00:30 ngày mai',
      );
      expect(
        clock.formatRunAt(DateTime.utc(2026, 11, 14, 13), now: now),
        '20:00 hôm qua',
      );
      expect(
        clock.formatRunAt(DateTime.utc(2026, 11, 20, 13), now: now),
        '20:00 · 20/11',
      );
    });

    test('blank timezone means the default home timezone', () {
      expect(HomeClock(null).timezone, defaultHomeTimezone);
      expect(HomeClock('  ').timezone, defaultHomeTimezone);
      expect(HomeClock(null).isExact, isTrue);
    });

    test('zones with daylight saving fall back to the phone clock', () {
      final fallback = HomeClock('Europe/Paris');
      expect(fallback.isExact, isFalse);
      final instant = DateTime.utc(2026, 11, 15, 13);
      final local = instant.toLocal();
      expect(fallback.partsOf(instant).hour, local.hour);
    });
  });

  test('day keys roll over months and years', () {
    expect(addDaysToKey('2026-12-31', 1), '2027-01-01');
    expect(addDaysToKey('2026-03-01', -1), '2026-02-28');
    expect(dayLabel('2026-11-16', '2026-11-15'), 'ngày mai');
    expect(composeWhen('07:30', '2026-11-18', '2026-11-15'), '07:30 · 18/11');
  });
}
