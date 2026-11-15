import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:smart_home_mobile/app/app.dart';
import 'package:smart_home_mobile/core/config/app_config.dart';
import 'package:smart_home_mobile/core/network/api_exception.dart';
import 'package:smart_home_mobile/core/storage/session_storage.dart';
import 'package:smart_home_mobile/mock/mock_backend.dart';
import 'package:smart_home_mobile/mock/mock_providers.dart';
import 'package:smart_home_mobile/modules/automation/automation.dart';
import 'package:smart_home_mobile/modules/automation/data/schedule_mock_repository.dart';
import 'package:smart_home_mobile/modules/devices/devices.dart';
import 'package:smart_home_mobile/modules/realtime/realtime.dart';

/// Home 1 = "Nhà của Nguyễn Hoàng Đạt"; account 7 owns it, 9 is a VIEWER.
const _homeId = 1;

Future<void> _expectApiError(
  Future<Object?> Function() action,
  String code,
) async {
  try {
    await action();
  } on ApiException catch (error) {
    expect(error.code, code);
    return;
  }
  fail('expected ApiException($code)');
}

/// Opens the "Thiết bị" page from the home screen ("Tất cả thiết bị").
Future<void> _openDeviceList(WidgetTester tester) async {
  final button = find.byKey(const ValueKey<String>('all-devices'));
  await tester.scrollUntilVisible(
    button,
    300,
    scrollable: find.byType(Scrollable).first,
  );
  await tester.tap(button);
  await tester.pumpAndSettle();
}

void main() {
  group('MockScheduleRepository', () {
    // 12:00 in Hà Nội on 15/11/2026; tests move it forward.
    late DateTime now;
    late MockBackend backend;
    late MockScheduleRepository repository;

    CustomerDevice device(String name) => backend.devices.firstWhere(
      (d) => d.homeId == _homeId && d.name == name,
    );

    setUp(() {
      now = DateTime.utc(2026, 11, 15, 5);
      backend = MockBackend(clock: () => now)..currentUserId = 7;
      repository = MockScheduleRepository(backend);
    });

    test('starts with sample schedules: two upcoming, one finished', () async {
      final upcoming = await repository.list(_homeId, ScheduleScope.upcoming);
      expect(upcoming.map((s) => s.actionLabel), ['Tắt đèn', 'Bật quạt']);
      expect(upcoming.every((s) => s.canCancel), isTrue);
      expect(upcoming.first.runAt, now.add(const Duration(hours: 2)));
      final history = await repository.list(_homeId, ScheduleScope.history);
      expect(history.map((s) => s.status), [ScheduleStatus.done]);
      expect(history.single.origin, ScheduleOrigin.aiAgent);
    });

    test('creates a schedule at the time typed on the home clock', () async {
      final lamp = device('Đèn phòng khách');
      final created = await repository.create(
        _homeId,
        ScheduleInput(
          deviceId: lamp.id,
          action: ScheduleAction.turnOn,
          when: const ScheduleAt('20:00'),
        ),
      );
      expect(created.actionLabel, 'Bật đèn');
      expect(created.status, ScheduleStatus.scheduled);
      expect(created.runAt, DateTime.utc(2026, 11, 15, 13));
      expect(created.timezone, 'Asia/Ho_Chi_Minh');
      expect(created.deviceName, 'Đèn phòng khách');
      expect(created.roomName, 'Phòng khách');
      expect(created.origin, ScheduleOrigin.user);
      expect(created.channel, 'mobile');
      expect(created.createdByName, 'Nguyễn Hoàng Đạt');
      expect(created.canCancel, isTrue);

      final upcoming = await repository.list(_homeId, ScheduleScope.upcoming);
      expect(upcoming.length, 3);
      expect(upcoming.map((s) => s.id), contains(created.id));
    });

    test('"lần tới" rolls to tomorrow when the time has passed', () async {
      final lamp = device('Đèn phòng khách');
      final created = await repository.create(
        _homeId,
        ScheduleInput(
          deviceId: lamp.id,
          action: ScheduleAction.turnOff,
          when: const ScheduleAt('08:00'),
        ),
      );
      expect(created.runAt, DateTime.utc(2026, 11, 16, 1));
    });

    test('action labels carry no room and follow the appliance', () async {
      final curtain = device('Rèm cửa phòng khách');
      final ac = device('Điều hòa phòng khách');
      Future<Schedule> make(
        CustomerDevice d,
        ScheduleAction a, {
        int? position,
        int? temperature,
      }) => repository.create(
        _homeId,
        ScheduleInput(
          deviceId: d.id,
          action: a,
          position: position,
          temperature: temperature,
          when: const ScheduleAfter(10),
        ),
      );
      expect(
        (await make(curtain, ScheduleAction.setPos, position: 50)).actionLabel,
        'Mở rèm 50%',
      );
      expect(
        (await make(curtain, ScheduleAction.setPos, position: 0)).actionLabel,
        'Đóng rèm',
      );
      expect(
        (await make(curtain, ScheduleAction.setPos, position: 100)).actionLabel,
        'Mở rèm',
      );
      expect(
        (await make(ac, ScheduleAction.setTemp, temperature: 26)).actionLabel,
        'Đặt điều hoà 26°C',
      );
      expect(
        (await make(ac, ScheduleAction.turnOff)).actionLabel,
        'Tắt điều hoà',
      );
    });

    test('rejects what the backend rejects', () async {
      final lamp = device('Đèn phòng khách');
      final ac = device('Điều hòa phòng khách');
      final sensor = backend.devices.firstWhere(
        (d) => d.homeId == _homeId && d.isSensor,
      );
      Future<Schedule> create(
        int id,
        ScheduleAction a, {
        int? temperature,
        ScheduleWhen when = const ScheduleAfter(10),
      }) => repository.create(
        _homeId,
        ScheduleInput(
          deviceId: id,
          action: a,
          temperature: temperature,
          when: when,
        ),
      );

      // A lamp cannot be told a temperature; a sensor is not a relay.
      await _expectApiError(
        () => create(lamp.id, ScheduleAction.setTemp, temperature: 24),
        'NOT_CONTROLLABLE',
      );
      await _expectApiError(
        () => create(sensor.id, ScheduleAction.turnOn),
        'NOT_CONTROLLABLE',
      );
      // Temperature out of 16..30, minutes out of 1..10080, a window < 30 s.
      await _expectApiError(
        () => create(ac.id, ScheduleAction.setTemp, temperature: 31),
        'INVALID_INPUT',
      );
      await _expectApiError(
        () => create(
          lamp.id,
          ScheduleAction.turnOn,
          when: const ScheduleAfter(0),
        ),
        'INVALID_INPUT',
      );
      await _expectApiError(
        () => create(
          lamp.id,
          ScheduleAction.turnOn,
          when: const ScheduleAfter(10081),
        ),
        'INVALID_INPUT',
      );
      await _expectApiError(
        () => create(
          lamp.id,
          ScheduleAction.turnOn,
          when: const ScheduleAt('08:00', date: '2026-11-15'),
        ),
        'INVALID_WHEN',
      );
      await _expectApiError(
        () => create(
          lamp.id,
          ScheduleAction.turnOn,
          when: const ScheduleAt('08:00', date: '2026-11-30'),
        ),
        'INVALID_WHEN',
      );
      // A device that is not in the home → 404.
      await _expectApiError(
        () => create(999999, ScheduleAction.turnOn),
        'NOT_FOUND',
      );
    });

    test('a VIEWER cannot create', () async {
      backend.currentUserId = 9;
      final lamp = device('Đèn phòng khách');
      await _expectApiError(
        () => repository.create(
          _homeId,
          ScheduleInput(
            deviceId: lamp.id,
            action: ScheduleAction.turnOn,
            when: const ScheduleAfter(10),
          ),
        ),
        'FORBIDDEN',
      );
      // …but sees the list, without cancel buttons.
      final upcoming = await repository.list(_homeId, ScheduleScope.upcoming);
      expect(upcoming, isNotEmpty);
      expect(upcoming.any((s) => s.canCancel), isFalse);
    });

    test('a home outside the account is 404', () async {
      await _expectApiError(
        () => repository.list(2, ScheduleScope.upcoming),
        'NOT_FOUND',
      );
    });

    test('cancels only while scheduled', () async {
      final first = (await repository.list(
        _homeId,
        ScheduleScope.upcoming,
      )).first;
      final cancelled = await repository.cancel(first.id);
      expect(cancelled.status, ScheduleStatus.cancelled);
      expect(cancelled.canCancel, isFalse);

      final upcoming = await repository.list(_homeId, ScheduleScope.upcoming);
      expect(upcoming.map((s) => s.id), isNot(contains(first.id)));
      final history = await repository.list(_homeId, ScheduleScope.history);
      expect(history.map((s) => s.id), contains(first.id));

      await _expectApiError(
        () => repository.cancel(first.id),
        'SCHEDULE_NOT_CANCELLABLE',
      );
      await _expectApiError(() => repository.cancel(424242), 'NOT_FOUND');
    });

    test('at most 50 pending schedules per home', () async {
      final lamp = device('Đèn phòng khách');
      Future<Schedule> make() => repository.create(
        _homeId,
        ScheduleInput(
          deviceId: lamp.id,
          action: ScheduleAction.turnOn,
          when: const ScheduleAfter(60),
        ),
      );
      // Two samples are already pending.
      for (var i = 0; i < 48; i++) {
        await make();
      }
      await _expectApiError(make, 'SCHEDULE_LIMIT');
      // Cancelling one frees a slot.
      final upcoming = await repository.list(_homeId, ScheduleScope.upcoming);
      await repository.cancel(upcoming.first.id);
      await make();
    });

    test('a schedule that reaches its time runs the device', () async {
      final lamp = device('Đèn phòng khách');
      expect(lamp.power, isTrue);
      final created = await repository.create(
        _homeId,
        ScheduleInput(
          deviceId: lamp.id,
          action: ScheduleAction.turnOff,
          when: const ScheduleAfter(1),
        ),
      );
      // Not yet due.
      expect(device('Đèn phòng khách').power, isTrue);

      now = now.add(const Duration(minutes: 2));
      final upcoming = await repository.list(_homeId, ScheduleScope.upcoming);
      expect(upcoming.map((s) => s.id), isNot(contains(created.id)));
      final history = await repository.list(_homeId, ScheduleScope.history);
      final ran = history.firstWhere((s) => s.id == created.id);
      expect(ran.status, ScheduleStatus.done);
      expect(ran.executedAt, now);
      expect(device('Đèn phòng khách').power, isFalse);
      await _expectApiError(
        () => repository.cancel(created.id),
        'SCHEDULE_NOT_CANCELLABLE',
      );
    });

    test(
      'an offline device fails with a reason; same state is skipped',
      () async {
        final lamp = device('Đèn phòng khách');
        final bedroomFan = device('Quạt phòng khách');
        // Already on → "turn on" is skipped.
        await repository.create(
          _homeId,
          ScheduleInput(
            deviceId: lamp.id,
            action: ScheduleAction.turnOn,
            when: const ScheduleAfter(1),
          ),
        );
        // Offline device → failed.
        final index = backend.devices.indexWhere((d) => d.id == bedroomFan.id);
        backend.devices[index] = backend.devices[index].copyWith(online: false);
        final offline = await repository.create(
          _homeId,
          ScheduleInput(
            deviceId: bedroomFan.id,
            action: ScheduleAction.turnOff,
            when: const ScheduleAfter(1),
          ),
        );

        now = now.add(const Duration(minutes: 2));
        final history = await repository.list(_homeId, ScheduleScope.history);
        final failed = history.firstWhere((s) => s.id == offline.id);
        expect(failed.status, ScheduleStatus.failed);
        expect(scheduleReason(failed), 'Thiết bị đang ngoại tuyến.');
        expect(
          history
              .where((s) => s.status == ScheduleStatus.skipped)
              .single
              .errorCode,
          'ALREADY_IN_STATE',
        );
      },
    );
  });

  group('screens (mock backend)', () {
    late MockBackend backend;

    Widget app() => ProviderScope(
      retry: (_, _) => null,
      overrides: [
        appConfigProvider.overrideWithValue(
          const AppConfig(apiBaseUrl: 'http://localhost:5000', useMock: true),
        ),
        sessionStorageProvider.overrideWithValue(MemorySessionStorage()),
        mockBackendProvider.overrideWithValue(backend),
        realtimeEnabledProvider.overrideWithValue(false),
      ],
      child: const SmartHomeApp(),
    );

    Future<void> open(WidgetTester tester, String email) async {
      tester.view.physicalSize = const Size(1000, 3200);
      tester.view.devicePixelRatio = 1;
      addTearDown(tester.view.reset);
      await tester.pumpWidget(app());
      await tester.pumpAndSettle();
      await tester.enterText(find.byType(TextFormField).at(0), email);
      await tester.enterText(find.byType(TextFormField).at(1), 'user123');
      await tester.tap(find.text('ĐĂNG NHẬP'));
      await tester.pumpAndSettle();
    }

    Future<void> openAutomation(WidgetTester tester) async {
      await tester.tap(find.byKey(const ValueKey<String>('nav-Tự động')));
      await tester.pumpAndSettle();
    }

    Future<void> tapKey(WidgetTester tester, String key) async {
      final finder = find.byKey(ValueKey<String>(key));
      // The sheet scrolls on a small phone.
      await tester.ensureVisible(finder);
      await tester.pumpAndSettle();
      await tester.tap(finder);
      await tester.pumpAndSettle();
    }

    CustomerDevice mockDevice(String name) => backend.devices.firstWhere(
      (d) => d.homeId == _homeId && d.name == name,
    );

    setUp(() => backend = MockBackend());

    testWidgets('the Tự động tab has "Hẹn giờ" and "Tự động hoá"', (
      tester,
    ) async {
      await open(tester, 'user01@smarthome.local');
      await openAutomation(tester);

      expect(find.text('Hẹn giờ'), findsOneWidget);
      expect(find.text('Tự động hoá'), findsOneWidget);
      // Schedules come first, with the two samples and no floating button.
      expect(
        find.byKey(const ValueKey<String>('schedule-add')),
        findsOneWidget,
      );
      expect(find.text('Tắt đèn'), findsOneWidget);
      expect(find.text('Bật quạt'), findsOneWidget);
      // The only floating button is the shell's (assistant), not ours.
      expect(
        find.widgetWithText(FloatingActionButton, 'Thêm hẹn giờ'),
        findsNothing,
      );
      expect(find.textContaining('còn'), findsWidgets);

      await tapKey(tester, 'automation-tab-rules');
      expect(find.text('Phòng khách nóng → bật quạt'), findsOneWidget);
      expect(find.byKey(const ValueKey<String>('rule-add')), findsOneWidget);
      expect(
        find.widgetWithText(FloatingActionButton, 'Tạo quy tắc'),
        findsNothing,
      );
    });

    testWidgets('create a schedule and see it under "Sắp chạy"', (
      tester,
    ) async {
      await open(tester, 'user01@smarthome.local');
      await openAutomation(tester);
      expect(find.text('Tắt quạt'), findsNothing);

      await tapKey(tester, 'schedule-add');
      expect(find.text('Thêm hẹn giờ'), findsWidgets);
      final fan = mockDevice('Quạt phòng khách');
      await tapKey(tester, 'schedule-device-${fan.id}');
      await tapKey(tester, 'schedule-choice-off');
      await tapKey(tester, 'schedule-mode-after');
      await tapKey(tester, 'schedule-after-15');
      expect(find.textContaining('Sẽ chạy:'), findsOneWidget);

      await tapKey(tester, 'schedule-save');
      // The sheet closed and the new row is in the list.
      expect(find.byKey(const ValueKey<String>('schedule-save')), findsNothing);
      expect(find.text('Đã tạo hẹn giờ.'), findsOneWidget);
      expect(find.text('Tắt quạt'), findsOneWidget);
      expect(find.textContaining('Phòng khách'), findsWidgets);
    });

    testWidgets('a bad form shows guidance inside the sheet and keeps input', (
      tester,
    ) async {
      await open(tester, 'user01@smarthome.local');
      await openAutomation(tester);
      await tapKey(tester, 'schedule-add');

      // Air conditioner → "Đặt nhiệt độ" shows the field; 40 °C is refused.
      final ac = mockDevice('Điều hòa phòng khách');
      await tapKey(tester, 'schedule-device-${ac.id}');
      await tapKey(tester, 'schedule-choice-temp');
      expect(
        find.byKey(const ValueKey<String>('schedule-temperature')),
        findsOneWidget,
      );
      await tester.enterText(
        find.byKey(const ValueKey<String>('schedule-temperature')),
        '40',
      );
      await tapKey(tester, 'schedule-save');
      expect(
        find.byKey(const ValueKey<String>('schedule-error')),
        findsOneWidget,
      );
      expect(find.textContaining('từ 16 đến 30'), findsWidgets);
      // The sheet stayed open with the input.
      expect(
        find.byKey(const ValueKey<String>('schedule-save')),
        findsOneWidget,
      );
      expect(find.text('40'), findsOneWidget);

      // "Sau" with an empty field is refused with the limits.
      await tester.enterText(
        find.byKey(const ValueKey<String>('schedule-temperature')),
        '24',
      );
      await tapKey(tester, 'schedule-mode-after');
      await tester.enterText(
        find.byKey(const ValueKey<String>('schedule-minutes')),
        '',
      );
      await tapKey(tester, 'schedule-save');
      expect(find.textContaining('số phút từ 1 đến 10080'), findsOneWidget);
    });

    testWidgets('cancel asks first, then the row disappears', (tester) async {
      await open(tester, 'user01@smarthome.local');
      await openAutomation(tester);
      expect(find.text('Bật quạt'), findsOneWidget);

      // Samples are ids 1 (Tắt đèn) and 2 (Bật quạt).
      await tapKey(tester, 'schedule-cancel-2');
      expect(find.textContaining('Huỷ “Bật quạt” lúc'), findsOneWidget);
      // "Giữ lại" keeps it.
      await tester.tap(find.text('Giữ lại'));
      await tester.pumpAndSettle();
      expect(find.text('Bật quạt'), findsOneWidget);

      await tapKey(tester, 'schedule-cancel-2');
      await tester.tap(find.widgetWithText(TextButton, 'Huỷ hẹn giờ'));
      await tester.pumpAndSettle();
      expect(find.text('Đã huỷ hẹn giờ.'), findsOneWidget);
      expect(find.text('Bật quạt'), findsNothing);

      // It moved to the history, labelled "Đã huỷ".
      await tapKey(tester, 'schedule-scope-history');
      expect(find.text('Bật quạt'), findsOneWidget);
      expect(find.text('Đã huỷ'), findsOneWidget);
      expect(find.text('Đã chạy'), findsOneWidget);
      // The source label of the run, plus the caption of the mic in the bar.
      expect(find.text('Trợ lý'), findsNWidgets(2));
    });

    testWidgets('the list and the sheet fit a 360 px phone', (tester) async {
      await open(tester, 'user01@smarthome.local');
      tester.view.physicalSize = const Size(360, 740);
      await tester.pumpAndSettle();
      await openAutomation(tester);
      await tapKey(tester, 'schedule-scope-history');
      await tapKey(tester, 'schedule-scope-upcoming');
      await tapKey(tester, 'schedule-add');
      final ac = mockDevice('Điều hòa phòng khách');
      await tapKey(tester, 'schedule-device-${ac.id}');
      await tapKey(tester, 'schedule-choice-temp');
      await tapKey(tester, 'schedule-date-pick');
      expect(tester.takeException(), isNull);
      await tapKey(tester, 'schedule-mode-after');
      expect(tester.takeException(), isNull);
    });

    testWidgets('a VIEWER only reads the schedules', (tester) async {
      await open(tester, 'hoa@smarthome.local');
      await openAutomation(tester);
      expect(find.byKey(const ValueKey<String>('schedule-add')), findsNothing);
      expect(find.textContaining('chỉ được xem các hẹn giờ'), findsOneWidget);
      expect(
        find.byKey(const ValueKey<String>('schedule-cancel-1')),
        findsNothing,
      );
    });

    testWidgets('the device detail has a "Hẹn giờ" block only for schedulable '
        'relays', (tester) async {
      await open(tester, 'user01@smarthome.local');

      Future<void> openDetail(String name) async {
        await tester.tap(
          find.descendant(
            of: find.byType(DeviceTile),
            matching: find.text(name),
          ),
        );
        await tester.pumpAndSettle();
      }

      await openDetail('Đèn phòng khách');
      expect(
        find.byKey(const ValueKey<String>('device-schedule-section')),
        findsOneWidget,
      );
      // Only this lamp's schedule is listed (Tắt đèn); the fan's is not.
      expect(find.text('Tắt đèn'), findsOneWidget);
      expect(find.text('Bật quạt'), findsNothing);

      // "Thêm hẹn giờ" opens the sheet with the lamp preselected.
      await tapKey(tester, 'device-schedule-add');
      final lamp = mockDevice('Đèn phòng khách');
      expect(
        find.byKey(ValueKey<String>('schedule-device-${lamp.id}')),
        findsOneWidget,
      );
      expect(
        find.byKey(const ValueKey<String>('schedule-choice-on')),
        findsOneWidget,
      );
      await tapKey(tester, 'schedule-mode-after');
      await tapKey(tester, 'schedule-after-5');
      await tapKey(tester, 'schedule-save');
      expect(find.text('Đã tạo hẹn giờ.'), findsOneWidget);
      expect(find.text('Bật đèn'), findsOneWidget);

      // A sensor has no such block (open it from the "Thiết bị" page).
      await tester.pageBack();
      await tester.pumpAndSettle();
      await _openDeviceList(tester);
      await tester.tap(
        find.descendant(
          of: find.byType(DeviceRow),
          matching: find.text('Cảm biến nhiệt/ẩm phòng khách'),
        ),
      );
      await tester.pumpAndSettle();
      expect(find.text('Nhiệt độ'), findsWidgets);
      expect(
        find.byKey(const ValueKey<String>('device-schedule-section')),
        findsNothing,
      );
    });
  });
}
