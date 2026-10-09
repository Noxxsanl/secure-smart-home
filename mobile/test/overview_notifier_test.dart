import 'dart:async';

import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:smart_home_mobile/core/network/api_exception.dart';
import 'package:smart_home_mobile/features/auth/presentation/providers/auth_providers.dart';
import 'package:smart_home_mobile/features/devices/domain/device.dart';
import 'package:smart_home_mobile/features/devices/domain/device_repository.dart';
import 'package:smart_home_mobile/features/devices/presentation/providers/device_providers.dart';
import 'package:smart_home_mobile/features/homes/domain/home.dart';
import 'package:smart_home_mobile/features/homes/domain/home_repository.dart';
import 'package:smart_home_mobile/features/homes/domain/home_role.dart';
import 'package:smart_home_mobile/features/homes/domain/overview.dart';
import 'package:smart_home_mobile/features/homes/presentation/providers/homes_providers.dart';
import 'package:smart_home_mobile/features/rooms/domain/room.dart';
import 'package:smart_home_mobile/features/shell/domain/realtime_event.dart';

const _home = Home(
  id: 1,
  name: 'Nhà',
  package: 'KIT_A',
  status: HomeStatus.active,
  timezone: 'Asia/Ho_Chi_Minh',
);

CustomerDevice _relay({bool power = false, bool online = true, bool canControl = true}) =>
    CustomerDevice(
      id: 11,
      deviceUid: 'ESP32-RL-1',
      name: 'Đèn',
      category: DeviceCategory.relay,
      homeId: 1,
      roomId: 5,
      status: DeviceStatus.active,
      online: online,
      canControl: canControl,
      power: power,
    );

class _FakeHomes implements HomeRepository {
  _FakeHomes(this.device);

  final CustomerDevice device;

  @override
  Future<List<MyHome>> listHomes() async => const [];

  @override
  Future<HomeOverview> overview(int homeId) async => HomeOverview(
    home: _home,
    role: HomeRole.owner,
    rooms: const [RoomSummary(id: 5, homeId: 1, name: 'Phòng', roomType: 'living_room')],
    devices: [device],
  );

  @override
  Future<Home> updateHome(int homeId, {String? name, String? address}) async =>
      _home;
}

class _FakeDevices implements DeviceRepository {
  _FakeDevices(this.onCommand);

  final Future<CommandResult> Function(PowerAction action) onCommand;

  @override
  Future<CommandResult> sendCommand(int deviceId, PowerAction action) =>
      onCommand(action);

  @override
  Future<DeviceDetail> getDevice(int deviceId) => throw UnimplementedError();

  @override
  Future<CustomerDevice> renameDevice(int deviceId, String name) =>
      throw UnimplementedError();

  @override
  Future<TelemetrySeries> telemetry(int deviceId, TelemetryRange range) =>
      throw UnimplementedError();
}

ProviderContainer _container(
  CustomerDevice device,
  Future<CommandResult> Function(PowerAction) onCommand,
) {
  final container = ProviderContainer(
    retry: (_, _) => null,
    overrides: [
      sessionUserIdProvider.overrideWithValue(7),
      homeRepositoryProvider.overrideWithValue(_FakeHomes(device)),
      deviceRepositoryProvider.overrideWithValue(_FakeDevices(onCommand)),
    ],
  );
  addTearDown(container.dispose);
  return container;
}

void main() {
  test('relay switch is optimistic and rolls back when the command times out', () async {
    final gate = Completer<CommandResult>();
    final container = _container(_relay(), (_) => gate.future);
    final provider = homeOverviewProvider(1);
    await container.read(provider.future);
    final notifier = container.read(provider.notifier);

    final call = notifier.setPower(11, true);
    // Optimistic: flipped immediately, command in flight.
    expect(container.read(provider).value!.deviceById(11)!.isOn, isTrue);
    expect(container.read(pendingCommandsProvider), {11});
    // A second tap while in flight is ignored.
    await notifier.setPower(11, false);
    expect(container.read(provider).value!.deviceById(11)!.isOn, isTrue);

    gate.completeError(const ApiException(code: ApiErrorCode.timeout, statusCode: 504));
    await expectLater(
      call,
      throwsA(isA<ApiException>().having((e) => e.code, 'code', 'TIMEOUT')),
    );
    expect(container.read(provider).value!.deviceById(11)!.isOn, isFalse);
    expect(container.read(pendingCommandsProvider), isEmpty);
    expect(container.read(provider).value!.rooms.single.onCount, 0);
  });

  test('successful command keeps the acknowledged state', () async {
    final container = _container(
      _relay(),
      (action) async => CommandResult(
        id: 1,
        action: action,
        status: 'acked',
        device: _relay(power: true),
      ),
    );
    final provider = homeOverviewProvider(1);
    await container.read(provider.future);
    await container.read(provider.notifier).setPower(11, true);

    final overview = container.read(provider).value!;
    expect(overview.deviceById(11)!.isOn, isTrue);
    expect(overview.rooms.single.onCount, 1);
    expect(container.read(pendingCommandsProvider), isEmpty);
  });

  test('offline or not-controllable relays never send a command', () async {
    var sent = 0;
    for (final device in [_relay(online: false), _relay(canControl: false)]) {
      final container = _container(device, (action) async {
        sent++;
        throw StateError('must not be called');
      });
      final provider = homeOverviewProvider(1);
      await container.read(provider.future);
      await container.read(provider.notifier).setPower(11, true);
      expect(container.read(provider).value!.deviceById(11)!.isOn, isFalse);
    }
    expect(sent, 0);
  });

  test('realtime device_state and telemetry update the live overview', () async {
    final sensor = CustomerDevice(
      id: 10,
      deviceUid: 'ESP32-SN-1',
      name: 'Cảm biến',
      category: DeviceCategory.sensor,
      homeId: 1,
      roomId: 5,
      status: DeviceStatus.active,
      online: true,
      canControl: false,
    );
    final container = _container(_relay(), (_) => throw UnimplementedError());
    final provider = homeOverviewProvider(1);
    await container.read(provider.future);
    final notifier = container.read(provider.notifier);

    notifier.applyDeviceState(
      const DeviceStateEvent(homeId: 1, deviceId: 11, online: false, power: true),
    );
    var device = container.read(provider).value!.deviceById(11)!;
    expect(device.online, isFalse);
    expect(device.isOn, isTrue);

    // Unknown device → ignored (no crash).
    notifier.applyTelemetry(
      TelemetryEvent(homeId: 1, deviceId: sensor.id, reading: const Reading(temperature: 30)),
    );
    expect(container.read(provider).value!.deviceById(10), isNull);
  });
}
