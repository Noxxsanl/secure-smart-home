import 'dart:async';
import 'dart:typed_data';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:smart_home_mobile/app/app.dart';
import 'package:smart_home_mobile/core/config/app_config.dart';
import 'package:smart_home_mobile/core/network/api_exception.dart';
import 'package:smart_home_mobile/core/realtime/realtime_source.dart';
import 'package:smart_home_mobile/core/storage/session_storage.dart';
import 'package:smart_home_mobile/core/utils/json.dart';
import 'package:smart_home_mobile/mock/mock_backend.dart';
import 'package:smart_home_mobile/mock/mock_providers.dart';
import 'package:smart_home_mobile/modules/auth/auth.dart';
import 'package:smart_home_mobile/modules/devices/devices.dart';
import 'package:smart_home_mobile/modules/devices/features/device_detail/relay_control.dart';
import 'package:smart_home_mobile/modules/homes/homes.dart';
import 'package:smart_home_mobile/modules/realtime/realtime.dart';

// ---------------------------------------------------------------- fixtures

const _home = Home(
  id: 1,
  name: 'Nhà',
  package: 'KIT_A',
  status: HomeStatus.active,
  timezone: 'Asia/Ho_Chi_Minh',
);

const _room = RoomSummary(
  id: 5,
  homeId: 1,
  name: 'Phòng khách',
  roomType: 'living_room',
);

CustomerDevice _curtain({
  int? pos = 0,
  bool power = false,
  bool online = true,
}) => CustomerDevice(
  id: 20,
  deviceUid: 'ESP32-RL-20',
  name: 'Rèm cửa',
  category: DeviceCategory.relay,
  homeId: 1,
  roomId: 5,
  status: DeviceStatus.active,
  online: online,
  canControl: true,
  power: power,
  appliance: ApplianceKind.curtain,
  curtainPos: pos,
);

CustomerDevice _ac({
  int? setpoint = 26,
  bool power = false,
  int? codes,
  ApplianceKind? appliance = ApplianceKind.airConditioner,
  String name = 'Điều hòa',
}) => CustomerDevice(
  id: 21,
  deviceUid: 'ESP32-RL-21',
  name: name,
  category: DeviceCategory.relay,
  homeId: 1,
  roomId: 5,
  status: DeviceStatus.active,
  online: true,
  canControl: true,
  power: power,
  appliance: appliance,
  acSetpoint: setpoint,
  acCodes: codes,
);

Map<String, dynamic> _deviceJson({Map<String, dynamic> extra = const {}}) => {
  'id': 11,
  'device_uid': 'ESP32-RL-11',
  'device_name': 'Rèm cửa phòng khách',
  'category': 'relay',
  'home_id': 1,
  'room_id': 5,
  'room_name': 'Phòng khách',
  'status': 'active',
  'online': true,
  'last_seen': '2026-10-05T08:00:00.000Z',
  'power': true,
  'latest': null,
  'can_control': true,
  ...extra,
};

class _FakeHomes implements HomeRepository {
  _FakeHomes(this.devices);

  final List<CustomerDevice> devices;

  @override
  Future<List<MyHome>> listHomes() async => const [];

  @override
  Future<HomeOverview> overview(int homeId) async => HomeOverview(
    home: _home,
    role: HomeRole.owner,
    rooms: const [_room],
    devices: devices,
  );

  @override
  Future<Home> updateHome(int homeId, {String? name, String? address}) async =>
      _home;
}

class _FakeDevices implements DeviceRepository {
  _FakeDevices(this.onCommand);

  final Future<CommandResult> Function(DeviceCommand command) onCommand;

  @override
  Future<CommandResult> sendCommand(int deviceId, DeviceCommand command) =>
      onCommand(command);

  @override
  Future<DeviceDetail> getDevice(int deviceId) => throw UnimplementedError();

  @override
  Future<CustomerDevice> renameDevice(int deviceId, String name) =>
      throw UnimplementedError();

  @override
  Future<TelemetrySeries> telemetry(int deviceId, TelemetryRange range) =>
      throw UnimplementedError();

  @override
  Future<List<CameraSnapshot>> listSnapshots(int deviceId, {int limit = 20}) =>
      throw UnimplementedError();

  @override
  Future<Uint8List> snapshotImage(int snapshotId) => throw UnimplementedError();
}

CommandResult _ok(DeviceCommand command, CustomerDevice device) =>
    CommandResult(
      id: 1,
      action: command.action,
      status: 'acked',
      device: device,
    );

ProviderContainer _container(
  List<CustomerDevice> devices,
  Future<CommandResult> Function(DeviceCommand) onCommand,
) {
  final container = ProviderContainer(
    retry: (_, _) => null,
    overrides: [
      sessionUserIdProvider.overrideWithValue(7),
      homeRepositoryProvider.overrideWithValue(_FakeHomes(devices)),
      deviceRepositoryProvider.overrideWithValue(_FakeDevices(onCommand)),
    ],
  );
  addTearDown(container.dispose);
  return container;
}

final _overview = homeOverviewProvider(1);

CustomerDevice _live(ProviderContainer container, int id) =>
    container.read(_overview).value!.deviceById(id)!;

ApiException _api(String code, int status) =>
    ApiException(code: code, statusCode: status);

// -------------------------------------------------------------------- tests

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
  group('JSON and realtime mapping', () {
    test(
      'CustomerDevice reads appliance, ac_setpoint, ac_codes, curtain_pos',
      () {
        final device = deviceFromJson(
          asJson(
            _deviceJson(
              extra: {
                'appliance': 'curtain',
                'curtain_pos': 50,
                'ac_setpoint': '24',
                'ac_codes': 2049,
              },
            ),
          ),
        );
        expect(device.appliance, ApplianceKind.curtain);
        expect(device.curtainPos, 50);
        expect(device.acSetpoint, 24);
        expect(device.acCodes, 2049);
      },
    );

    test('missing or unknown values stay null (backend has not assigned)', () {
      final device = deviceFromJson(
        asJson(_deviceJson(extra: {'appliance': 'toaster'})),
      );
      expect(device.appliance, isNull);
      expect(device.acSetpoint, isNull);
      expect(device.acCodes, isNull);
      expect(device.curtainPos, isNull);
      // Not assigned: the name still decides the icon and wording …
      expect(ApplianceKind.of(device), ApplianceKind.curtain);
      // … but the extra commands and the schedule stay closed.
      expect(device.isAirConditioner, isFalse);
      expect(device.isSchedulable, isFalse);
    });

    test('ApplianceKind.fromApi / of prefer what the backend says', () {
      expect(ApplianceKind.fromApi('ac'), ApplianceKind.airConditioner);
      expect(ApplianceKind.fromApi('lamp'), ApplianceKind.lamp);
      expect(ApplianceKind.fromApi('switch'), isNull);
      expect(ApplianceKind.fromApi(null), isNull);
      // A lamp named like a fan is still a lamp.
      final device = deviceFromJson(
        asJson(
          _deviceJson(extra: {'device_name': 'Quạt trần', 'appliance': 'lamp'}),
        ),
      );
      expect(ApplianceKind.of(device), ApplianceKind.lamp);
    });

    test('isSchedulable: controllable relay with a classified appliance', () {
      expect(_curtain().isSchedulable, isTrue);
      expect(_ac().isSchedulable, isTrue);
      expect(_ac(appliance: null).isSchedulable, isFalse);
      expect(_ac().copyWith(canControl: false).isSchedulable, isFalse);
      final sensor = deviceFromJson(
        asJson(_deviceJson(extra: {'category': 'sensor', 'appliance': 'lamp'})),
      );
      expect(sensor.isSchedulable, isFalse);
    });

    test('command result keeps the action that was executed', () {
      CommandResult parse(String action) => commandResultFromJson(
        asJson({
          'command': {'id': 5, 'action': action, 'status': 'acked'},
          'device': _deviceJson(),
        }),
      );
      expect(parse('turn_off').action, CommandAction.turnOff);
      expect(parse('set_pos').action, CommandAction.setPos);
      expect(parse('set_temp').action, CommandAction.setTemp);
      expect(parse('learn_code').action, CommandAction.learnCode);
      expect(parse('self_destruct').action, CommandAction.unknown);
    });

    test('device_state frame carries the three live values, null included', () {
      final event =
          parseRealtimeEvent(
                RealtimeMessage('device_state', {
                  'type': 'device_state',
                  'home_id': 1,
                  'device': {
                    'id': 21,
                    'room_id': 5,
                    'online': true,
                    'last_seen': '2026-10-05T08:00:00.000Z',
                    'power': true,
                    'status': 'active',
                    'ac_setpoint': 24,
                    'ac_codes': 7,
                    'curtain_pos': null,
                  },
                }),
              )!
              as DeviceStateEvent;
      expect(event.acSetpoint, 24);
      expect(event.acCodes, 7);
      expect(event.curtainPos, isNull);
    });

    test('applyDeviceState applies the values as sent (null clears)', () async {
      final container = _container(
        [_curtain(pos: 100, power: true), _ac(codes: 5)],
        (_) {
          throw UnimplementedError();
        },
      );
      await container.read(_overview.future);
      final notifier = container.read(_overview.notifier);

      notifier.applyDeviceState(
        const DeviceStateEvent(
          homeId: 1,
          deviceId: 20,
          power: true,
          curtainPos: 50,
        ),
      );
      expect(_live(container, 20).curtainPos, 50);

      notifier.applyDeviceState(
        const DeviceStateEvent(homeId: 1, deviceId: 20, power: false),
      );
      expect(_live(container, 20).curtainPos, isNull);

      notifier.applyDeviceState(
        const DeviceStateEvent(
          homeId: 1,
          deviceId: 21,
          power: true,
          acSetpoint: 25,
          acCodes: 9,
        ),
      );
      final ac = _live(container, 21);
      expect((ac.acSetpoint, ac.acCodes, ac.isOn), (25, 9, true));
      // The frame has no `appliance`: the classification stays.
      expect(ac.appliance, ApplianceKind.airConditioner);
    });
  });

  group('commands', () {
    test('request bodies follow the contract', () {
      expect(const DeviceCommand.turnOn().toJson(), {'action': 'turn_on'});
      expect(DeviceCommand.power(false).toJson(), {'action': 'turn_off'});
      expect(DeviceCommand.setPosition(50).toJson(), {
        'action': 'set_pos',
        'position': 50,
      });
      expect(DeviceCommand.setTemperature(24).toJson(), {
        'action': 'set_temp',
        'temperature': 24,
      });
      expect(DeviceCommand.learnCode(AcSlot.off).toJson(), {
        'action': 'learn_code',
        'slot': 'off',
      });
      expect(DeviceCommand.learnCode(AcSlot.temp(18)).toJson(), {
        'action': 'learn_code',
        'slot': 18,
      });
    });

    test('values are kept in range, learning waits longer than the rest', () {
      expect(DeviceCommand.setPosition(140).position, 100);
      expect(DeviceCommand.setPosition(-3).position, 0);
      expect(DeviceCommand.setTemperature(10).temperature, 16);
      expect(DeviceCommand.setTemperature(99).temperature, 30);
      expect(DeviceCommand.power(true).timeout, const Duration(seconds: 8));
      expect(
        DeviceCommand.learnCode(AcSlot.off).timeout,
        const Duration(seconds: 20),
      );
    });
  });

  group('curtain levels', () {
    test('active level: known position, tolerance ±2, then power', () {
      expect(activeCurtainLevel(0, true), 0);
      expect(activeCurtainLevel(49, false), 50);
      expect(activeCurtainLevel(52, false), 50);
      expect(activeCurtainLevel(53, false), isNull);
      expect(activeCurtainLevel(98, null), 100);
      expect(activeCurtainLevel(30, true), isNull);
      expect(activeCurtainLevel(null, true), 100);
      expect(activeCurtainLevel(null, false), 0);
      expect(activeCurtainLevel(null, null), isNull);
    });

    test('status text', () {
      expect(curtainStatusText(0, true), 'Đang đóng');
      expect(curtainStatusText(50, true), 'Đang mở 50%');
      expect(curtainStatusText(100, null), 'Đang mở 100%');
      expect(curtainStatusText(null, true), 'Đang mở');
      expect(curtainStatusText(null, false), 'Đang đóng');
      expect(curtainStatusText(null, null), 'Chưa rõ vị trí');
      expect(deviceSubtitle(_curtain(pos: 50, power: true)), 'Đang mở 50%');
    });
  });

  group('IR code bitmask', () {
    test('bit 0 is OFF, bit (t - 15) is t °C', () {
      expect(AcSlot.off.bit, 0);
      expect(AcSlot.temp(16).bit, 1);
      expect(AcSlot.temp(30).bit, 15);
      expect(acSlots, hasLength(16));
      expect(acSlots.first, AcSlot.off);
      expect(acSlots.last, AcSlot.temp(30));
    });

    test('learned count and cells follow ac_codes', () {
      final mask = acCodesMask([AcSlot.off, AcSlot.temp(24), AcSlot.temp(28)]);
      expect(mask, 1 | (1 << 9) | (1 << 13));
      expect(learnedCount(mask), 3);
      expect(isSlotLearned(mask, AcSlot.off), isTrue);
      expect(isSlotLearned(mask, AcSlot.temp(24)), isTrue);
      expect(isSlotLearned(mask, AcSlot.temp(25)), isFalse);
      expect(learnedCount(0), 0);
      expect(learnedCount(0xFFFF), 16);
      // The Node has not reported yet: unknown, not "not learned".
      expect(learnedCount(null), isNull);
      expect(isSlotLearned(null, AcSlot.off), isNull);
    });

    test('instructions tell where to aim the remote', () {
      expect(learnInstruction(AcSlot.off), contains('bấm nút nguồn'));
      expect(learnInstruction(AcSlot.temp(24)), contains('đúng 24°C'));
      expect(learnInstruction(AcSlot.off), contains('5–20 cm'));
    });
  });

  group('overview notifier', () {
    test(
      'curtain level is optimistic and goes back when the Node is silent',
      () async {
        final gate = Completer<CommandResult>();
        final sent = <DeviceCommand>[];
        final container = _container([_curtain(pos: 0)], (command) {
          sent.add(command);
          return gate.future;
        });
        await container.read(_overview.future);
        final notifier = container.read(_overview.notifier);

        final call = notifier.setCurtainPosition(20, 50);
        var shown = _live(container, 20);
        expect((shown.curtainPos, shown.isOn), (50, true));
        expect(container.read(pendingCommandsProvider), {20});
        // A second tap while the first is on its way is ignored.
        await notifier.setCurtainPosition(20, 100);
        expect(sent, hasLength(1));
        expect(sent.single.toJson(), {'action': 'set_pos', 'position': 50});

        gate.completeError(_api('TIMEOUT', 504));
        await expectLater(call, throwsA(isA<ApiException>()));
        shown = _live(container, 20);
        expect((shown.curtainPos, shown.isOn), (0, false));
        expect(container.read(pendingCommandsProvider), isEmpty);
      },
    );

    test(
      'curtain command succeeds: the server device replaces the guess',
      () async {
        final container = _container([
          _curtain(pos: 0),
        ], (command) async => _ok(command, _curtain(pos: 49, power: true)));
        await container.read(_overview.future);
        await container.read(_overview.notifier).setCurtainPosition(20, 50);
        expect(_live(container, 20).curtainPos, 49);
        expect(container.read(_overview).value!.rooms.single.onCount, 1);
      },
    );

    test(
      'a curtain, offline or not, ignores commands it cannot take',
      () async {
        var sent = 0;
        final container = _container([_curtain(online: false), _ac()], (
          command,
        ) async {
          sent++;
          throw StateError('must not be called');
        });
        await container.read(_overview.future);
        final notifier = container.read(_overview.notifier);
        await notifier.setCurtainPosition(20, 50); // offline
        await notifier.setCurtainPosition(21, 50); // not a curtain
        expect(sent, 0);
        expect(_live(container, 20).curtainPos, 0);
      },
    );

    testWidgets('quick − / + taps become one set_temp after 600 ms', (
      tester,
    ) async {
      final sent = <DeviceCommand>[];
      final container = _container([_ac(setpoint: 26, codes: 0xFFFF)], (
        command,
      ) async {
        sent.add(command);
        return _ok(
          command,
          _ac(setpoint: command.temperature, power: true, codes: 0xFFFF),
        );
      });
      await container.read(_overview.future);
      final notifier = container.read(_overview.notifier);

      final first = notifier.adjustSetpoint(21, 1);
      final second = notifier.adjustSetpoint(21, 1);
      final third = notifier.adjustSetpoint(21, 1);
      // Shown at once, nothing sent yet.
      expect(container.read(setpointDraftsProvider), {21: 29});
      await tester.pump(const Duration(milliseconds: 599));
      expect(sent, isEmpty);
      await tester.pump(const Duration(milliseconds: 1));
      await tester.pump();

      expect(sent, hasLength(1));
      expect(sent.single.toJson(), {'action': 'set_temp', 'temperature': 29});
      await Future.wait([first, second, third]);
      final ac = _live(container, 21);
      expect((ac.acSetpoint, ac.isOn), (29, true));
      expect(container.read(setpointDraftsProvider), isEmpty);
      expect(container.read(pendingCommandsProvider), isEmpty);
    });

    testWidgets('set point is kept in 16..30', (tester) async {
      final container = _container([_ac(setpoint: 30, power: true)], (
        command,
      ) async {
        throw StateError('no command expected');
      });
      await container.read(_overview.future);
      await container.read(_overview.notifier).adjustSetpoint(21, 1);
      expect(container.read(setpointDraftsProvider), isEmpty);

      // 16 is a legal value: − from 17 shows it, going lower does nothing.
      final low = _container([_ac(setpoint: 17, power: true)], (command) async {
        return _ok(command, _ac(setpoint: 16, power: true));
      });
      await low.read(_overview.future);
      final notifier = low.read(_overview.notifier);
      final down = notifier.adjustSetpoint(21, -1);
      expect(low.read(setpointDraftsProvider), {21: 16});
      await tester.pump(const Duration(milliseconds: 600));
      await tester.pump();
      await down;
      await notifier.adjustSetpoint(21, -1);
      expect(low.read(setpointDraftsProvider), isEmpty);
    });

    testWidgets('a refused set_temp brings the old value back and reports it', (
      tester,
    ) async {
      final container = _container([_ac(setpoint: 26, power: false)], (
        command,
      ) async {
        throw _api('COMMAND_FAILED', 502);
      });
      await container.read(_overview.future);
      final notifier = container.read(_overview.notifier);

      final done = notifier.adjustSetpoint(21, 1);
      final expectation = expectLater(
        done,
        throwsA(
          isA<ApiException>().having((e) => e.code, 'code', 'COMMAND_FAILED'),
        ),
      );
      expect(container.read(setpointDraftsProvider), {21: 27});
      await tester.pump(const Duration(milliseconds: 600));
      await tester.pump();
      await expectation;

      final ac = _live(container, 21);
      expect((ac.acSetpoint, ac.isOn), (26, false));
      expect(container.read(setpointDraftsProvider), isEmpty);
      expect(container.read(pendingCommandsProvider), isEmpty);
    });

    testWidgets('tapping back to the server value sends nothing', (
      tester,
    ) async {
      var sent = 0;
      final container = _container([_ac(setpoint: 26, power: true)], (
        command,
      ) async {
        sent++;
        return _ok(command, _ac());
      });
      await container.read(_overview.future);
      final notifier = container.read(_overview.notifier);
      final up = notifier.adjustSetpoint(21, 1);
      final back = notifier.adjustSetpoint(21, -1);
      await tester.pump(const Duration(milliseconds: 600));
      await tester.pump();
      await Future.wait([up, back]);
      expect(sent, 0);
      expect(container.read(setpointDraftsProvider), isEmpty);
    });

    testWidgets(
      'learning: one slot at a time, 10 s countdown, notice at the end',
      (tester) async {
        final gate = Completer<CommandResult>();
        final sent = <DeviceCommand>[];
        final container = _container([_ac(codes: 1)], (command) {
          sent.add(command);
          return gate.future;
        });
        await container.read(_overview.future);
        final notifier = container.read(_overview.notifier);

        final learning = notifier.learnCode(21, AcSlot.temp(24));
        var state = container.read(acLearnProvider);
        expect(state.isLearningDevice(21), isTrue);
        expect(state.slot, AcSlot.temp(24));
        expect(state.secondsLeft, 10);

        // Another slot while the Node is listening: ignored.
        expect(await notifier.learnCode(21, AcSlot.off), isNull);
        expect(sent, hasLength(1));
        expect(sent.single.toJson(), {'action': 'learn_code', 'slot': 24});

        await tester.pump(const Duration(seconds: 3));
        expect(container.read(acLearnProvider).secondsLeft, 7);
        await tester.pump(const Duration(seconds: 8));
        // Time is up, still waiting for the Node's answer.
        state = container.read(acLearnProvider);
        expect(state.secondsLeft, 0);
        expect(state.isLearning, isTrue);

        gate.complete(
          _ok(
            sent.single,
            _ac(codes: acCodesMask([AcSlot.off, AcSlot.temp(24)])),
          ),
        );
        final notice = await learning;
        expect(notice!.success, isTrue);
        expect(notice.text, contains('Đã học mã 24°C'));
        state = container.read(acLearnProvider);
        expect(state.isLearning, isFalse);
        expect(state.notice, same(notice));
        expect(learnedCount(_live(container, 21).acCodes), 2);
      },
    );

    testWidgets('a failed learning gives the remote-aiming advice', (
      tester,
    ) async {
      final container = _container([_ac(codes: 1)], (command) async {
        throw _api('COMMAND_FAILED', 502);
      });
      await container.read(_overview.future);
      final notice = await container
          .read(_overview.notifier)
          .learnCode(21, AcSlot.temp(20));
      await tester.pump();
      expect(notice!.success, isFalse);
      expect(notice.text, contains('Node không thu được tín hiệu'));
      expect(notice.text, isNot(contains('COMMAND_FAILED')));
      expect(container.read(acLearnProvider).isLearning, isFalse);
      expect(container.read(acLearnProvider).notice, same(notice));
    });
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

    CustomerDevice mockDevice(String name, {int homeId = 1}) =>
        backend.devices.firstWhere((d) => d.homeId == homeId && d.name == name);

    setUp(() => backend = MockBackend());

    testWidgets(
      'home: curtain tile has 3 levels; 50% sends set_pos and says so',
      (tester) async {
        await open(tester, 'user01@smarthome.local');
        final curtain = mockDevice('Rèm cửa phòng khách');
        final tile = find.ancestor(
          of: find.byKey(ValueKey<String>('curtain-${curtain.id}-50')),
          matching: find.byType(DeviceTile),
        );
        expect(
          find.descendant(of: tile, matching: find.text('Đang mở 100%')),
          findsOneWidget,
        );
        for (final label in ['Đóng', '50%', '100%']) {
          expect(
            find.descendant(of: tile, matching: find.text(label)),
            findsOneWidget,
          );
        }
        // A curtain is not a switch.
        expect(
          find.descendant(of: tile, matching: find.byType(Switch)),
          findsNothing,
        );

        await tester.tap(
          find.byKey(ValueKey<String>('curtain-${curtain.id}-50')),
        );
        await tester.pumpAndSettle();
        expect(
          find.descendant(of: tile, matching: find.text('Đang mở 50%')),
          findsOneWidget,
        );
        expect(mockDevice('Rèm cửa phòng khách').curtainPos, 50);
        expect(mockDevice('Rèm cửa phòng khách').power, isTrue);

        // The button of the current level cannot be tapped again.
        await tester.tap(
          find.byKey(ValueKey<String>('curtain-${curtain.id}-50')),
        );
        await tester.pumpAndSettle();

        await tester.tap(
          find.byKey(ValueKey<String>('curtain-${curtain.id}-0')),
        );
        await tester.pumpAndSettle();
        expect(
          find.descendant(of: tile, matching: find.text('Đang đóng')),
          findsOneWidget,
        );
        expect(mockDevice('Rèm cửa phòng khách').power, isFalse);
      },
    );

    testWidgets('home: air conditioner tile − / + changes "Đặt …°C" at once', (
      tester,
    ) async {
      await open(tester, 'user01@smarthome.local');
      final ac = mockDevice('Điều hòa phòng khách');
      Finder setpoint() => find.byKey(ValueKey<String>('ac-setpoint-${ac.id}'));
      expect(tester.widget<Text>(setpoint()).data, 'Đặt 26°C');

      await tester.tap(find.byKey(ValueKey<String>('ac-plus-${ac.id}')));
      await tester.pump();
      expect(tester.widget<Text>(setpoint()).data, 'Đặt 27°C');
      await tester.tap(find.byKey(ValueKey<String>('ac-plus-${ac.id}')));
      await tester.pump();
      expect(tester.widget<Text>(setpoint()).data, 'Đặt 28°C');
      // Nothing is sent while the taps keep coming.
      expect(mockDevice('Điều hòa phòng khách').acSetpoint, 26);

      await tester.pump(const Duration(milliseconds: 600));
      await tester.pumpAndSettle();
      expect(tester.widget<Text>(setpoint()).data, 'Đặt 28°C');
      final stored = mockDevice('Điều hòa phòng khách');
      expect((stored.acSetpoint, stored.power), (28, true));
    });

    testWidgets('home: a refused temperature explains itself and goes back', (
      tester,
    ) async {
      await open(tester, 'user01@smarthome.local');
      final ac = mockDevice('Điều hòa phòng khách');
      // The mock Node learned OFF and 24 … 28 °C only: 29 is refused.
      for (var i = 0; i < 3; i++) {
        await tester.tap(find.byKey(ValueKey<String>('ac-plus-${ac.id}')));
        await tester.pump();
      }
      expect(
        tester
            .widget<Text>(find.byKey(ValueKey<String>('ac-setpoint-${ac.id}')))
            .data,
        'Đặt 29°C',
      );
      await tester.pump(const Duration(milliseconds: 600));
      await tester.pumpAndSettle();
      expect(
        tester
            .widget<Text>(find.byKey(ValueKey<String>('ac-setpoint-${ac.id}')))
            .data,
        'Đặt 26°C',
      );
      expect(find.textContaining('Điều hòa chưa nhận lệnh'), findsOneWidget);
      expect(find.textContaining('COMMAND_FAILED'), findsNothing);
      expect(mockDevice('Điều hòa phòng khách').power, isFalse);
    });

    testWidgets('tiles, rows and the AC panel fit a 360 px phone', (
      tester,
    ) async {
      await open(tester, 'user01@smarthome.local');
      tester.view.physicalSize = const Size(360, 3200);
      await tester.pumpAndSettle();
      // Home tiles (curtain levels, set point) …
      expect(find.byType(DeviceTile), findsWidgets);
      // … the devices page rows …
      await _openDeviceList(tester);
      expect(find.byType(DeviceRow), findsWidgets);
      // … and the air-conditioner detail panel.
      final ac = mockDevice('Điều hòa phòng khách');
      await tester.tap(
        find.descendant(
          of: find.byKey(ValueKey<String>('device-row-${ac.id}')),
          matching: find.text('Điều hòa phòng khách'),
        ),
      );
      await tester.pumpAndSettle();
      expect(find.byKey(const ValueKey<String>('ac-slot-30°C')), findsOneWidget);
      expect(tester.takeException(), isNull);
    });

    testWidgets('detail: air conditioner panel, learned grid, learn mode', (
      tester,
    ) async {
      backend.learnLatency = const Duration(seconds: 2);
      await open(tester, 'user01@smarthome.local');
      await tester.tap(
        find.descendant(
          of: find.byType(DeviceTile),
          matching: find.text('Điều hòa phòng khách'),
        ),
      );
      await tester.pumpAndSettle();

      expect(
        find.byKey(const ValueKey<String>('ac-panel-setpoint')),
        findsOneWidget,
      );
      expect(
        find.textContaining('Hiện chỉ bật/tắt được điều hòa'),
        findsNothing,
      );
      expect(
        tester
            .widget<Text>(
              find.byKey(const ValueKey<String>('ac-learned-count')),
            )
            .data,
        startsWith('6/16 mã đã học'),
      );
      expect(
        find.byKey(const ValueKey<String>('room-temperature')),
        findsOneWidget,
      );

      // Outside learn mode an unlearned cell cannot be pressed.
      await tester.tap(
        find.byKey(const ValueKey<String>('ac-slot-29°C')),
        warnIfMissed: false,
      );
      await tester.pump();
      expect(
        find.byKey(const ValueKey<String>('ac-learning-banner')),
        findsNothing,
      );

      await tester.tap(find.byKey(const ValueKey<String>('ac-learn-mode')));
      await tester.pump();
      expect(find.textContaining('Chế độ học mã'), findsOneWidget);
      await tester.tap(find.byKey(const ValueKey<String>('ac-slot-29°C')));
      await tester.pump();
      expect(
        find.byKey(const ValueKey<String>('ac-learning-banner')),
        findsOneWidget,
      );
      expect(
        find.textContaining('Đang học mã 29°C — còn 10 giây'),
        findsOneWidget,
      );
      expect(find.textContaining('đúng 29°C'), findsOneWidget);

      await tester.pump(const Duration(seconds: 1));
      expect(find.textContaining('còn 9 giây'), findsOneWidget);
      await tester.pump(const Duration(seconds: 1));
      await tester.pumpAndSettle();
      expect(
        find.byKey(const ValueKey<String>('ac-learning-banner')),
        findsNothing,
      );
      expect(find.textContaining('Đã học mã 29°C'), findsWidgets);
      expect(
        tester
            .widget<Text>(
              find.byKey(const ValueKey<String>('ac-learned-count')),
            )
            .data,
        startsWith('7/16 mã đã học'),
      );
      expect(
        (mockDevice('Điều hòa phòng khách').acCodes! >> AcSlot.temp(29).bit) &
            1,
        1,
      );
    });

    testWidgets('detail: curtain has the three levels and the guidance line', (
      tester,
    ) async {
      await open(tester, 'user01@smarthome.local');
      await tester.tap(
        find.descendant(
          of: find.byType(DeviceTile),
          matching: find.text('Rèm cửa phòng khách'),
        ),
      );
      await tester.pumpAndSettle();
      expect(
        find.text('Chọn Đóng, 50% hoặc 100% để điều khiển rèm'),
        findsOneWidget,
      );
      expect(
        find.byKey(const ValueKey<String>('curtain-status')),
        findsOneWidget,
      );
      final curtain = mockDevice('Rèm cửa phòng khách');
      await tester.tap(
        find.byKey(ValueKey<String>('curtain-${curtain.id}-50')),
      );
      await tester.pumpAndSettle();
      expect(
        tester
            .widget<Text>(find.byKey(const ValueKey<String>('curtain-status')))
            .data,
        'Đang mở 50%',
      );
    });

    testWidgets('a name that only looks like an air conditioner stays on/off', (
      tester,
    ) async {
      final device = _ac(appliance: null, name: 'Điều hòa cũ');
      final overview = HomeOverview(
        home: _home,
        role: HomeRole.owner,
        rooms: const [_room],
        devices: [device],
      );
      await tester.pumpWidget(
        ProviderScope(
          overrides: [sessionUserIdProvider.overrideWithValue(7)],
          child: MaterialApp(
            home: Scaffold(
              body: SingleChildScrollView(
                child: RelayControl(device: device, home: overview),
              ),
            ),
          ),
        ),
      );
      expect(
        find.text(
          'Thiết bị này chưa được khai báo là điều hòa nên chỉ bật/tắt được.',
        ),
        findsOneWidget,
      );
      expect(
        find.byKey(const ValueKey<String>('device-power-switch')),
        findsOneWidget,
      );
      expect(
        find.byKey(const ValueKey<String>('ac-panel-setpoint')),
        findsNothing,
      );
      expect(
        find.textContaining('Hiện chỉ bật/tắt được điều hòa'),
        findsNothing,
      );
    });

    testWidgets('devices page: grouped by room, filters, no gateway', (
      tester,
    ) async {
      await open(tester, 'user01@smarthome.local');
      // The home screen no longer lists rooms; the devices page is one tap away.
      expect(find.byKey(const ValueKey<String>('all-devices')), findsOneWidget);
      expect(
        find.byKey(const ValueKey<String>('device-list-view')),
        findsNothing,
      );

      await _openDeviceList(tester);
      expect(find.widgetWithText(AppBar, 'Thiết bị'), findsOneWidget);
      expect(
        find.byKey(const ValueKey<String>('device-list-view')),
        findsOneWidget,
      );
      final visible = backend.devices.where(
        (d) => d.homeId == 1 && d.category != DeviceCategory.gateway,
      );
      expect(
        find.textContaining('${visible.length} thiết bị, nhóm theo phòng'),
        findsOneWidget,
      );
      for (final device in visible) {
        expect(
          find.byKey(ValueKey<String>('device-row-${device.id}')),
          findsOneWidget,
        );
      }
      // OWNER: no role notice.
      expect(find.textContaining('Với vai trò'), findsNothing);

      // "Đang bật": only what is running (lamp and curtain at 100 %).
      await tester.tap(find.byKey(const ValueKey<String>('device-filter-on')));
      await tester.pumpAndSettle();
      expect(
        find.byKey(
          ValueKey<String>('device-row-${mockDevice('Đèn phòng khách').id}'),
        ),
        findsOneWidget,
      );
      expect(
        find.byKey(
          ValueKey<String>(
            'device-row-${mockDevice('Rèm cửa phòng khách').id}',
          ),
        ),
        findsOneWidget,
      );
      expect(
        find.byKey(
          ValueKey<String>('device-row-${mockDevice('Quạt phòng khách').id}'),
        ),
        findsNothing,
      );

      // Nothing is offline in "Nhà của Nguyễn Hoàng Đạt".
      await tester.tap(
        find.byKey(const ValueKey<String>('device-filter-offline')),
      );
      await tester.pumpAndSettle();
      expect(find.text('Không có thiết bị phù hợp'), findsOneWidget);

      await tester.tap(find.byKey(const ValueKey<String>('device-filter-all')));
      await tester.pumpAndSettle();
      // A row opens the device page.
      await tester.tap(
        find.descendant(
          of: find.byKey(
            ValueKey<String>('device-row-${mockDevice('Quạt phòng khách').id}'),
          ),
          matching: find.text('Quạt phòng khách'),
        ),
      );
      await tester.pumpAndSettle();
      expect(find.widgetWithText(AppBar, 'Quạt phòng khách'), findsOneWidget);
    });

    testWidgets('devices page: VIEWER is told why nothing can be switched', (
      tester,
    ) async {
      await open(tester, 'hoa@smarthome.local');
      await _openDeviceList(tester);
      expect(
        find.textContaining(
          'Với vai trò Chỉ xem, bạn chỉ xem được trạng thái thiết bị',
        ),
        findsOneWidget,
      );
      final curtain = mockDevice('Rèm cửa phòng khách');
      await tester.tap(
        find.byKey(ValueKey<String>('curtain-${curtain.id}-0')),
        warnIfMissed: false,
      );
      await tester.pumpAndSettle();
      expect(mockDevice('Rèm cửa phòng khách').curtainPos, 100);
    });
  });
}
