import 'package:flutter_test/flutter_test.dart';
import 'package:smart_home_mobile/core/network/api_exception.dart';
import 'package:smart_home_mobile/core/network/error_messages.dart';
import 'package:smart_home_mobile/core/utils/home_time.dart';
import 'package:smart_home_mobile/modules/automation/automation.dart';
import 'package:smart_home_mobile/modules/devices/devices.dart';

Map<String, dynamic> _json({Map<String, dynamic> extra = const {}}) => {
  'id': 31,
  'home_id': 1,
  'timezone': 'Asia/Ho_Chi_Minh',
  'device_id': 4,
  'device_name': 'Điều hòa phòng khách',
  'room_name': 'Phòng khách',
  'appliance': 'ac',
  'action': 'set_temp',
  'temperature': 26,
  'position': null,
  'action_label': 'Đặt điều hoà 26°C',
  'run_at': '2026-11-15T13:00:00.000Z',
  'status': 'scheduled',
  'origin': 'ai_agent',
  'channel': 'web',
  'created_by_user_id': 7,
  'created_by_name': 'Nguyễn Hoàng Đạt',
  'error_code': null,
  'executed_at': null,
  'cancelled_at': null,
  'created_at': '2026-11-15T04:00:00.000Z',
  'can_cancel': true,
  ...extra,
};

CustomerDevice _relay(ApplianceKind? appliance, {bool canControl = true}) =>
    CustomerDevice(
      id: 1,
      deviceUid: 'RL-1',
      name: 'Relay',
      category: DeviceCategory.relay,
      homeId: 1,
      status: DeviceStatus.active,
      online: true,
      canControl: canControl,
      appliance: appliance,
    );

void main() {
  // 12:00 on 15/11/2026 in Hà Nội (UTC+7).
  final now = DateTime.utc(2026, 11, 15, 5);
  final clock = HomeClock('Asia/Ho_Chi_Minh');

  group('scheduleFromJson', () {
    test('reads every field of the contract', () {
      final s = scheduleFromJson(_json());
      expect(s.id, 31);
      expect(s.homeId, 1);
      expect(s.timezone, 'Asia/Ho_Chi_Minh');
      expect(s.deviceId, 4);
      expect(s.deviceName, 'Điều hòa phòng khách');
      expect(s.roomName, 'Phòng khách');
      expect(s.appliance, ApplianceKind.airConditioner);
      expect(s.action, ScheduleAction.setTemp);
      expect(s.temperature, 26);
      expect(s.position, isNull);
      expect(s.actionLabel, 'Đặt điều hoà 26°C');
      expect(s.runAt, DateTime.utc(2026, 11, 15, 13));
      expect(s.status, ScheduleStatus.scheduled);
      expect(s.origin, ScheduleOrigin.aiAgent);
      expect(s.isAiAgent, isTrue);
      expect(s.channel, 'web');
      expect(s.createdByUserId, 7);
      expect(s.createdByName, 'Nguyễn Hoàng Đạt');
      expect(s.errorCode, isNull);
      expect(s.createdAt, DateTime.utc(2026, 11, 15, 4));
      expect(s.canCancel, isTrue);
    });

    test('a finished schedule keeps its reason and times', () {
      final s = scheduleFromJson(
        _json(
          extra: {
            'status': 'failed',
            'error_code': 'DEVICE_OFFLINE',
            'executed_at': '2026-11-15T13:00:04.000Z',
            'can_cancel': false,
          },
        ),
      );
      expect(s.status, ScheduleStatus.failed);
      expect(s.errorCode, 'DEVICE_OFFLINE');
      expect(s.executedAt, DateTime.utc(2026, 11, 15, 13, 0, 4));
      expect(s.canCancel, isFalse);
    });

    test(
      'unknown status / action / origin and a deleted device do not break',
      () {
        final s = scheduleFromJson(
          _json(
            extra: {
              'status': 'paused',
              'action': 'dim',
              'origin': 'robot',
              'appliance': 'toaster',
              'device_id': null,
              'device_name': null,
            },
          ),
        );
        expect(s.status, ScheduleStatus.unknown);
        expect(s.status.label, 'Không rõ');
        expect(s.status.isUpcoming, isFalse);
        expect(s.action, ScheduleAction.unknown);
        expect(s.origin, ScheduleOrigin.user);
        expect(s.appliance, isNull);
        expect(s.deviceId, isNull);
      },
    );

    test('the list is wrapped in items', () {
      final list = scheduleListFromJson({
        'items': [
          _json(),
          _json(extra: {'id': 32}),
        ],
      });
      expect(list.map((s) => s.id), [31, 32]);
      expect(scheduleListFromJson({'items': []}), isEmpty);
    });
  });

  group('choices by appliance', () {
    test('lamp and fan: on / off', () {
      for (final kind in [ApplianceKind.lamp, ApplianceKind.fan]) {
        final choices = scheduleChoicesFor(kind);
        expect(choices.map((c) => c.label), ['Bật', 'Tắt']);
        expect(choices.map((c) => c.action), [
          ScheduleAction.turnOn,
          ScheduleAction.turnOff,
        ]);
      }
    });

    test('curtain: open / half / close with a position (0 included)', () {
      final choices = scheduleChoicesFor(ApplianceKind.curtain);
      expect(choices.map((c) => c.label), ['Mở hết', 'Mở 50%', 'Đóng']);
      expect(choices.map((c) => c.position), [100, 50, 0]);
      expect(choices.every((c) => c.action == ScheduleAction.setPos), isTrue);
    });

    test('air conditioner: on / off / set a temperature', () {
      final choices = scheduleChoicesFor(ApplianceKind.airConditioner);
      expect(choices.map((c) => c.label), ['Bật', 'Tắt', 'Đặt nhiệt độ']);
      expect(choices.last.needsTemperature, isTrue);
      expect(choices.last.action, ScheduleAction.setTemp);
    });

    test('anything else has no choice', () {
      expect(scheduleChoicesFor(ApplianceKind.plainSwitch), isEmpty);
      expect(scheduleChoicesFor(null), isEmpty);
    });

    test('only classified relays the account controls are schedulable', () {
      final devices = [
        _relay(ApplianceKind.lamp),
        _relay(null),
        _relay(ApplianceKind.fan, canControl: false),
        _relay(ApplianceKind.curtain),
      ];
      expect(schedulableDevices(devices).length, 2);
    });
  });

  group('limits and input', () {
    test('constants match the backend', () {
      expect(scheduleTempMin, 16);
      expect(scheduleTempMax, 30);
      expect(scheduleTempDefault, 26);
      expect(scheduleAfterMin, 1);
      expect(scheduleAfterMax, 10080);
      expect(scheduleAfterPresets, [5, 15, 30, 60]);
    });

    test('minutes and temperature are validated', () {
      expect(parseAfterMinutes('30'), 30);
      expect(parseAfterMinutes(' 10080 '), 10080);
      expect(parseAfterMinutes('0'), isNull);
      expect(parseAfterMinutes('10081'), isNull);
      expect(parseAfterMinutes('1.5'), isNull);
      expect(parseAfterMinutes(''), isNull);
      expect(parseScheduleTemperature('16'), 16);
      expect(parseScheduleTemperature('30'), 30);
      expect(parseScheduleTemperature('31'), isNull);
      expect(parseScheduleTemperature('abc'), isNull);
    });

    test('request bodies', () {
      const lamp = ScheduleInput(
        deviceId: 3,
        action: ScheduleAction.turnOff,
        when: ScheduleAt('20:00'),
      );
      expect(lamp.toJson(), {
        'device_id': 3,
        'action': 'turn_off',
        'when': {'at': '20:00'},
      });
      const curtain = ScheduleInput(
        deviceId: 4,
        action: ScheduleAction.setPos,
        position: 0,
        when: ScheduleAfter(15),
      );
      expect(curtain.toJson(), {
        'device_id': 4,
        'action': 'set_pos',
        'position': 0,
        'when': {'after_minutes': 15},
      });
      const ac = ScheduleInput(
        deviceId: 5,
        action: ScheduleAction.setTemp,
        temperature: 24,
        when: ScheduleAt('06:30', date: '2026-11-16'),
      );
      expect(ac.toJson(), {
        'device_id': 5,
        'action': 'set_temp',
        'temperature': 24,
        'when': {'at': '06:30', 'date': '2026-11-16'},
      });
    });
  });

  group('buildWhen', () {
    test('"Lúc" without a date is "lần tới" and sends no date', () {
      final when = buildWhen(const WhenDraft(time: '20:00'), clock, now);
      expect(when, const ScheduleAt('20:00'));
      expect(when!.toJson().containsKey('date'), isFalse);
    });

    test('"Ngày mai" is tomorrow on the home calendar, not the phone/UTC', () {
      // 18:00 UTC on 15/11 is already 01:00 on 16/11 in the home.
      final late = DateTime.utc(2026, 11, 15, 18);
      expect(
        buildWhen(
          const WhenDraft(time: '07:00', dateChoice: DateChoice.tomorrow),
          clock,
          late,
        ),
        const ScheduleAt('07:00', date: '2026-11-17'),
      );
      expect(
        buildWhen(
          const WhenDraft(time: '07:00', dateChoice: DateChoice.tomorrow),
          clock,
          now,
        ),
        const ScheduleAt('07:00', date: '2026-11-16'),
      );
    });

    test('"Chọn ngày" needs a real date', () {
      expect(
        buildWhen(
          const WhenDraft(
            time: '07:00',
            dateChoice: DateChoice.pick,
            pickedDate: '2026-11-18',
          ),
          clock,
          now,
        ),
        const ScheduleAt('07:00', date: '2026-11-18'),
      );
      for (final bad in ['', '18/11/2026', '2026-02-30']) {
        expect(
          buildWhen(
            WhenDraft(
              time: '07:00',
              dateChoice: DateChoice.pick,
              pickedDate: bad,
            ),
            clock,
            now,
          ),
          isNull,
          reason: bad,
        );
      }
    });

    test('a malformed time or minutes give null', () {
      for (final bad in ['', '7:00', '24:00', '12:60', 'ab:cd']) {
        expect(
          buildWhen(WhenDraft(time: bad), clock, now),
          isNull,
          reason: bad,
        );
      }
      expect(
        buildWhen(
          const WhenDraft(mode: WhenMode.after, afterMinutes: '45'),
          clock,
          now,
        ),
        const ScheduleAfter(45),
      );
      expect(
        buildWhen(
          const WhenDraft(mode: WhenMode.after, afterMinutes: '0'),
          clock,
          now,
        ),
        isNull,
      );
    });
  });

  group('previewWhen / resolveRunAt', () {
    test('"lần tới" is today when the time is still ahead', () {
      expect(
        previewWhen(const ScheduleAt('20:00'), clock, now),
        '20:00 hôm nay',
      );
      expect(
        resolveRunAt(const ScheduleAt('20:00'), clock, now),
        DateTime.utc(2026, 11, 15, 13),
      );
    });

    test('"lần tới" moves to tomorrow once the time has passed', () {
      expect(
        previewWhen(const ScheduleAt('08:00'), clock, now),
        '08:00 ngày mai',
      );
      expect(
        resolveRunAt(const ScheduleAt('08:00'), clock, now),
        DateTime.utc(2026, 11, 16, 1),
      );
    });

    test('the 30 second threshold', () {
      // 12:00:00 now → 12:00 is in the past by the threshold rule.
      expect(
        previewWhen(const ScheduleAt('12:00'), clock, now),
        '12:00 ngày mai',
      );
      // 12:00:00 + 29 s: 12:01 is 31 s away → still today.
      final almost = DateTime.utc(2026, 11, 15, 5, 0, 29);
      expect(
        previewWhen(const ScheduleAt('12:01'), clock, almost),
        '12:01 hôm nay',
      );
      // 12:00:31: 12:01 is 29 s away (< 30 s) → tomorrow.
      final later = DateTime.utc(2026, 11, 15, 5, 0, 31);
      expect(
        previewWhen(const ScheduleAt('12:01'), clock, later),
        '12:01 ngày mai',
      );
    });

    test('an explicit date is kept as is', () {
      expect(
        previewWhen(const ScheduleAt('08:00', date: '2026-11-15'), clock, now),
        '08:00 hôm nay',
      );
      expect(
        previewWhen(const ScheduleAt('08:00', date: '2026-11-20'), clock, now),
        '08:00 · 20/11',
      );
    });

    test('"sau N phút"', () {
      expect(previewWhen(const ScheduleAfter(30), clock, now), '12:30 hôm nay');
      expect(
        previewWhen(const ScheduleAfter(720), clock, now),
        '00:00 ngày mai',
      );
      expect(previewWhen(null, clock, now), isNull);
    });
  });

  test('defaultScheduleTime is now + 30 minutes on the home clock', () {
    expect(defaultScheduleTime(clock, now), '12:30');
    expect(
      defaultScheduleTime(clock, DateTime.utc(2026, 11, 15, 16, 45)),
      '00:15',
    );
  });

  group('countdownText', () {
    String at(Duration d) => countdownText(now.add(d), now);

    test('minutes, hours, days', () {
      expect(at(const Duration(seconds: 20)), 'còn dưới 1 phút');
      expect(at(const Duration(minutes: 25)), 'còn 25 phút');
      expect(at(const Duration(minutes: 24, seconds: 10)), 'còn 25 phút');
      expect(at(const Duration(hours: 2)), 'còn 2 giờ');
      expect(at(const Duration(hours: 2, minutes: 10)), 'còn 2 giờ 10 phút');
      expect(at(const Duration(days: 3, hours: 4)), 'còn 3 ngày');
    });

    test('past due', () {
      expect(at(Duration.zero), 'đang chuẩn bị chạy');
      expect(at(const Duration(minutes: -3)), 'đang chuẩn bị chạy');
    });
  });

  group('wording', () {
    Schedule schedule(ScheduleStatus status, [String? code]) =>
        scheduleFromJson(
          _json(extra: {'status': status.apiValue, 'error_code': code}),
        );

    test('run time is read on the home clock', () {
      final s = schedule(ScheduleStatus.scheduled);
      expect(scheduleRunAtText(s, now), '20:00 hôm nay');
      expect(scheduleWhenWithCountdown(s, now), '20:00 hôm nay · còn 8 giờ');
    });

    test('status labels', () {
      expect(ScheduleStatus.scheduled.label, 'Chờ chạy');
      expect(ScheduleStatus.running.label, 'Đang chạy');
      expect(ScheduleStatus.done.label, 'Đã chạy');
      expect(ScheduleStatus.skipped.label, 'Bỏ qua');
      expect(ScheduleStatus.failed.label, 'Không chạy được');
      expect(ScheduleStatus.cancelled.label, 'Đã huỷ');
      expect(ScheduleStatus.missed.label, 'Bị bỏ lỡ');
    });

    test('reasons follow the error code', () {
      expect(
        scheduleReason(schedule(ScheduleStatus.failed, 'DEVICE_OFFLINE')),
        'Thiết bị đang ngoại tuyến.',
      );
      expect(
        scheduleReason(schedule(ScheduleStatus.skipped, 'ALREADY_IN_STATE')),
        'Thiết bị đã ở trạng thái mong muốn nên không cần gửi lệnh.',
      );
      expect(
        scheduleReason(schedule(ScheduleStatus.failed, 'SOMETHING_NEW')),
        'Lỗi không xác định.',
      );
      expect(
        scheduleReason(schedule(ScheduleStatus.missed)),
        'Hệ thống tạm dừng đúng giờ chạy nên lịch không chạy bù.',
      );
      expect(scheduleReason(schedule(ScheduleStatus.done)), isNull);
      expect(scheduleReason(schedule(ScheduleStatus.failed)), isNull);
    });

    test('errors are Vietnamese guidance, never raw codes', () {
      for (final entry in {
        'SCHEDULE_LIMIT': 'Nhà đã có 50 hẹn giờ đang chờ',
        'SCHEDULE_NOT_CANCELLABLE': 'không huỷ được nữa',
        'NOT_CONTROLLABLE': 'không hẹn giờ được thao tác đã chọn',
        'INVALID_INPUT': 'tối đa 7 ngày',
        'INVALID_WHEN': 'Thời điểm chưa hợp lệ',
        'HOME_SUSPENDED': 'tạm ngưng',
      }.entries) {
        final text = userMessageFor(
          ApiException(code: entry.key, statusCode: 409),
          overrides: scheduleErrors,
        );
        expect(text, contains(entry.value), reason: entry.key);
        expect(text, isNot(contains(entry.key)));
      }
      // Codes the table does not know still fall back to the shared wording.
      expect(
        userMessageFor(
          const ApiException(code: ApiErrorCode.networkError),
          overrides: scheduleErrors,
        ),
        networkErrorMessage,
      );
    });
  });
}
