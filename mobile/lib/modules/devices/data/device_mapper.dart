import '../../../core/utils/json.dart';
import '../domain/device.dart';

/// Contract §3 `Reading`.
Reading readingFromJson(Json json) => Reading(
  temperature: json.readDoubleOrNull('temperature'),
  humidity: json.readDoubleOrNull('humidity'),
  doorOpen: json.readBoolOrNull('door_open'),
  receivedAt: json.readDateOrNull('received_at'),
);

Reading? readingOrNull(Json? json) =>
    json == null ? null : readingFromJson(json);

/// Contract §3 `CustomerDevice`.
CustomerDevice deviceFromJson(Json json) => CustomerDevice(
  id: json.readInt('id'),
  deviceUid: json.readString('device_uid'),
  name: json.readString('device_name', fallback: 'Thiết bị'),
  category: DeviceCategory.fromApi(json.readStringOrNull('category')),
  homeId: json.readIntOrNull('home_id') ?? 0,
  roomId: json.readIntOrNull('room_id'),
  roomName: json.readStringOrNull('room_name'),
  status: DeviceStatus.fromApi(json.readStringOrNull('status')),
  online: json.readBool('online'),
  lastSeen: json.readDateOrNull('last_seen'),
  power: json.readBoolOrNull('power'),
  latest: readingOrNull(json.readObjectOrNull('latest')),
  canControl: json.readBool('can_control'),
);

/// `POST /devices/:id/commands` response.
CommandResult commandResultFromJson(Json json) {
  final command = json.readObject('command');
  return CommandResult(
    id: command.readIntOrNull('id') ?? 0,
    action: PowerAction.fromApi(command.readStringOrNull('action')),
    status: command.readString('status', fallback: 'acked'),
    issuedAt: command.readDateOrNull('issued_at'),
    ackedAt: command.readDateOrNull('acked_at'),
    device: deviceFromJson(json.readObject('device')),
  );
}

/// `GET /devices/:id/telemetry` response.
TelemetrySeries telemetryFromJson(Json json, TelemetryRange requested) {
  final points = <TelemetryPoint>[];
  for (final item in json.readObjectList('points')) {
    final time = item.readDateOrNull('t');
    if (time == null) continue;
    points.add(
      TelemetryPoint(
        time: time,
        temperature: item.readDoubleOrNull('temperature'),
        humidity: item.readDoubleOrNull('humidity'),
      ),
    );
  }
  final rangeValue = json.readStringOrNull('range');
  return TelemetrySeries(
    deviceId: json.readIntOrNull('device_id') ?? 0,
    range: TelemetryRange.values.firstWhere(
      (range) => range.apiValue == rangeValue,
      orElse: () => requested,
    ),
    bucketSeconds: json.readIntOrNull('bucket_seconds') ?? 300,
    points: points,
    latest: readingOrNull(json.readObjectOrNull('latest')),
  );
}
