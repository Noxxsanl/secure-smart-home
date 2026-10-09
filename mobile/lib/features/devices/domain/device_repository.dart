import '../../homes/domain/home.dart';
import '../../homes/domain/home_role.dart';
import '../../rooms/domain/room.dart';
import 'device.dart';

/// `GET /devices/:id` (contract §4.2).
class DeviceDetail {
  const DeviceDetail({
    required this.device,
    required this.home,
    required this.role,
    this.room,
  });

  final CustomerDevice device;
  final RoomSummary? room;
  final Home home;
  final HomeRole role;
}

/// Device reads/commands under `/api/mobile/devices/**`.
abstract class DeviceRepository {
  Future<DeviceDetail> getDevice(int deviceId);

  /// `PATCH /devices/:id { device_name }` (OWNER/CONTROLLER).
  Future<CustomerDevice> renameDevice(int deviceId, String name);

  /// `POST /devices/:id/commands`. The server acks within 5 s or answers
  /// `504 TIMEOUT`; the client gives up after 8 s (FR-5.3).
  Future<CommandResult> sendCommand(int deviceId, PowerAction action);

  /// `GET /devices/:id/telemetry?range=24h|7d` (FR-5.4).
  Future<TelemetrySeries> telemetry(int deviceId, TelemetryRange range);
}
