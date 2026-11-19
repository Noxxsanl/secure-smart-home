import 'dart:typed_data';

import '../../../mock/mock_backend.dart';
import '../domain/camera_snapshot.dart';
import '../domain/device.dart';
import '../domain/device_command.dart';
import '../domain/device_repository.dart';
import 'camera_mock_scene.dart';

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
  Future<CommandResult> sendCommand(int deviceId, DeviceCommand command) async {
    // The Node waits for the user to press the remote while learning.
    if (command.action == CommandAction.learnCode &&
        _backend.learnLatency > Duration.zero) {
      await Future<void>.delayed(_backend.learnLatency);
    }
    return _backend.respond(() => _backend.sendCommand(deviceId, command));
  }

  @override
  Future<TelemetrySeries> telemetry(int deviceId, TelemetryRange range) =>
      _backend.respond(() => _backend.telemetryFor(deviceId, range));

  /// Sample pictures of the mock camera: a few shots over the last day, newest
  /// first, drawn in pure Dart. Their ids are `deviceId * 100 + n`.
  @override
  Future<List<CameraSnapshot>> listSnapshots(int deviceId, {int limit = 20}) {
    return _backend.respond(() {
      final device = _backend.requireDevice(deviceId).device;
      if (!device.isCamera) return const <CameraSnapshot>[];
      final now = _backend.now;
      const shots = <(Duration, SnapshotTrigger)>[
        (Duration(minutes: 8), SnapshotTrigger.motion),
        (Duration(minutes: 52), SnapshotTrigger.request),
        (Duration(hours: 3, minutes: 5), SnapshotTrigger.motion),
        (Duration(hours: 7, minutes: 40), SnapshotTrigger.motion),
        (Duration(hours: 20), SnapshotTrigger.request),
      ];
      return [
        for (var i = 0; i < shots.length; i++)
          CameraSnapshot(
            id: deviceId * 100 + i + 1,
            trigger: shots[i].$2,
            sizeBytes: _sampleSnapshotBytes,
            capturedAt: now.subtract(shots[i].$1),
          ),
      ].take(limit).toList();
    });
  }

  @override
  Future<Uint8List> snapshotImage(int snapshotId) =>
      _backend.respond(() => mockCameraPng(seed: snapshotId));

  /// Size the sample list reports (the real PNG is a bit larger).
  static const _sampleSnapshotBytes = 58000;
}
