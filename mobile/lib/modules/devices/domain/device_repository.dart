import 'dart:typed_data';

import '../../homes/homes.dart';
import 'camera_snapshot.dart';
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

  /// `GET /devices/:id/snapshots?limit=` — newest first (cameras only).
  Future<List<CameraSnapshot>> listSnapshots(int deviceId, {int limit = 20});

  /// `GET /snapshots/:id/image` — the JPEG bytes. Sent with the Bearer token by
  /// the API client (which also refreshes an expired token), never via a bare URL.
  Future<Uint8List> snapshotImage(int snapshotId);
}
