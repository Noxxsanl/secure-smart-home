import 'dart:typed_data';

import '../../../core/network/api_client.dart';
import '../../../core/utils/json.dart';
import '../../homes/homes.dart';
import '../domain/camera_snapshot.dart';
import '../domain/device.dart';
import '../domain/device_command.dart';
import '../domain/device_repository.dart';
import 'device_mapper.dart';

/// `/api/mobile/devices/**` (contract §4.2).
class RemoteDeviceRepository implements DeviceRepository {
  RemoteDeviceRepository(this._api);

  final ApiClient _api;

  @override
  Future<DeviceDetail> getDevice(int deviceId) async {
    final json = asJson(await _api.get('/devices/$deviceId'));
    final room = json.readObjectOrNull('room');
    return DeviceDetail(
      device: deviceFromJson(json.readObject('device')),
      room: room == null ? null : roomFromJson(room),
      home: homeFromJson(json.readObject('home')),
      role: HomeRole.fromApi(json.readStringOrNull('role')),
    );
  }

  @override
  Future<CustomerDevice> renameDevice(int deviceId, String name) async {
    final data = await _api.patch(
      '/devices/$deviceId',
      body: {'device_name': name.trim()},
    );
    return deviceFromJson(asJson(data));
  }

  @override
  Future<CommandResult> sendCommand(int deviceId, DeviceCommand command) async {
    // The server answers `504 TIMEOUT` after 5 s without an ack (learning: the
    // Node waits ≤ 10 s for the remote, the server ≤ 15 s); the client allows
    // network slack on top (FR-5.3).
    final data = await _api.post(
      '/devices/$deviceId/commands',
      body: command.toJson(),
      timeout: command.timeout,
    );
    return commandResultFromJson(asJson(data));
  }

  @override
  Future<TelemetrySeries> telemetry(int deviceId, TelemetryRange range) async {
    final data = await _api.get(
      '/devices/$deviceId/telemetry',
      query: {'range': range.apiValue},
    );
    return telemetryFromJson(asJson(data), range);
  }

  @override
  Future<List<CameraSnapshot>> listSnapshots(
    int deviceId, {
    int limit = 20,
  }) async {
    final data = await _api.get(
      '/devices/$deviceId/snapshots',
      query: {'limit': limit.clamp(1, 50)},
    );
    return cameraSnapshotsFromJson(asJson(data));
  }

  @override
  Future<Uint8List> snapshotImage(int snapshotId) =>
      _api.getBytes('/snapshots/$snapshotId/image');
}
