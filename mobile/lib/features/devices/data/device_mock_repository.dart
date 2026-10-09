import '../../../mock/mock_backend.dart';
import '../domain/device.dart';
import '../domain/device_repository.dart';

class MockDeviceRepository implements DeviceRepository {
  MockDeviceRepository(this._backend);

  final MockBackend _backend;

  @override
  Future<DeviceDetail> getDevice(int deviceId) {
    return _backend.respond(() {
      final found = _backend.requireDevice(deviceId);
      final roomId = found.device.roomId;
      return DeviceDetail(
        device: found.device,
        room: roomId == null
            ? null
            : _backend.roomView(_backend.requireRoom(roomId), found.membership),
        home: _backend.homeRecord(found.device.homeId).home,
        role: found.membership.role,
      );
    });
  }

  @override
  Future<CustomerDevice> renameDevice(int deviceId, String name) {
    return _backend.respond(() {
      final found = _backend.requireDevice(deviceId);
      if (!found.membership.role.canRename) _backend.forbidden();
      final trimmed = name.trim();
      if (trimmed.isEmpty || trimmed.length > 64) _backend.invalidInput();
      final index = _backend.devices.indexWhere((d) => d.id == deviceId);
      _backend.devices[index] = _backend.devices[index].copyWith(name: trimmed);
      return _backend.deviceView(_backend.devices[index], found.membership);
    });
  }

  @override
  Future<CommandResult> sendCommand(int deviceId, PowerAction action) =>
      _backend.respond(() => _backend.sendCommand(deviceId, action));

  @override
  Future<TelemetrySeries> telemetry(int deviceId, TelemetryRange range) =>
      _backend.respond(() => _backend.telemetryFor(deviceId, range));
}
