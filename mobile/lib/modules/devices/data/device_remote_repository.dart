import '../../../core/network/api_client.dart';
import '../../../core/utils/json.dart';
import '../../homes/homes.dart';
import '../domain/device.dart';
import '../domain/device_repository.dart';
import 'device_mapper.dart';

/// `/api/mobile/devices/**` (contract §4.2).
class RemoteDeviceRepository implements DeviceRepository {
  RemoteDeviceRepository(this._api);

  final ApiClient _api;

  /// The server answers `504 TIMEOUT` after 5 s without an ack; allow a little
  /// network slack before giving up locally (FR-5.3).
  static const commandTimeout = Duration(seconds: 8);

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
  Future<CommandResult> sendCommand(int deviceId, PowerAction action) async {
    final data = await _api.post(
      '/devices/$deviceId/commands',
      body: {'action': action.apiValue},
      timeout: commandTimeout,
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
}
