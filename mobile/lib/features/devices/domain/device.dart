import 'package:flutter/foundation.dart';

enum DeviceCategory {
  gateway('gateway'),
  sensor('sensor'),
  relay('relay'),
  camera('camera'),
  doorContact('door_contact');

  const DeviceCategory(this.apiValue);

  final String apiValue;

  static DeviceCategory fromApi(String? value) {
    for (final category in values) {
      if (category.apiValue == value) return category;
    }
    return DeviceCategory.sensor;
  }
}

enum DeviceStatus {
  active,
  inactive,
  blocked;

  static DeviceStatus fromApi(String? value) {
    for (final status in values) {
      if (status.name == value) return status;
    }
    return DeviceStatus.active;
  }
}

/// Latest sensor sample (contract §3 `Reading`).
@immutable
class Reading {
  const Reading({
    this.temperature,
    this.humidity,
    this.doorOpen,
    this.receivedAt,
  });

  final double? temperature;
  final double? humidity;
  final bool? doorOpen;
  final DateTime? receivedAt;

  bool get hasClimate => temperature != null || humidity != null;
}

/// A device as the customer sees it (contract §3 `CustomerDevice`).
///
/// Never carries any secret: the backend does not send them and the app does
/// not store them (invariant 1).
@immutable
class CustomerDevice {
  const CustomerDevice({
    required this.id,
    required this.deviceUid,
    required this.name,
    required this.category,
    required this.homeId,
    required this.status,
    required this.online,
    required this.canControl,
    this.roomId,
    this.roomName,
    this.lastSeen,
    this.power,
    this.latest,
  });

  final int id;

  /// Public identifier (`ESP32-RL-…`), not a secret.
  final String deviceUid;
  final String name;
  final DeviceCategory category;
  final int homeId;
  final int? roomId;
  final String? roomName;
  final DeviceStatus status;
  final bool online;
  final DateTime? lastSeen;

  /// Relay state; `null` for other categories.
  final bool? power;
  final Reading? latest;

  /// Relay && the caller's role allows it, regardless of online state.
  final bool canControl;

  bool get isRelay => category == DeviceCategory.relay;
  bool get isSensor => category == DeviceCategory.sensor;
  bool get isDoorContact => category == DeviceCategory.doorContact;
  bool get isCamera => category == DeviceCategory.camera;
  bool get isOn => power ?? false;
  bool get isBlocked => status == DeviceStatus.blocked;

  /// FR-5.3/5.5: the switch is usable only for an online, active relay the
  /// caller may control.
  bool get canToggle => isRelay && canControl && online && !isBlocked;

  CustomerDevice copyWith({
    String? name,
    bool? online,
    DateTime? lastSeen,
    bool? power,
    Reading? latest,
    DeviceStatus? status,
    int? roomId,
    String? roomName,
    bool? canControl,
  }) => CustomerDevice(
    id: id,
    deviceUid: deviceUid,
    name: name ?? this.name,
    category: category,
    homeId: homeId,
    roomId: roomId ?? this.roomId,
    roomName: roomName ?? this.roomName,
    status: status ?? this.status,
    online: online ?? this.online,
    lastSeen: lastSeen ?? this.lastSeen,
    power: power ?? this.power,
    latest: latest ?? this.latest,
    canControl: canControl ?? this.canControl,
  );
}

enum PowerAction {
  turnOn('turn_on'),
  turnOff('turn_off');

  const PowerAction(this.apiValue);

  final String apiValue;

  static PowerAction fromApi(String? value) =>
      value == 'turn_on' ? PowerAction.turnOn : PowerAction.turnOff;

  static PowerAction forPower(bool on) =>
      on ? PowerAction.turnOn : PowerAction.turnOff;
}

/// Result of `POST /devices/:id/commands` (contract §4.2).
@immutable
class CommandResult {
  const CommandResult({
    required this.id,
    required this.action,
    required this.status,
    required this.device,
    this.issuedAt,
    this.ackedAt,
  });

  final int id;
  final PowerAction action;
  final String status;
  final DateTime? issuedAt;
  final DateTime? ackedAt;
  final CustomerDevice device;
}

enum TelemetryRange {
  last24Hours('24h', '24 giờ'),
  last7Days('7d', '7 ngày');

  const TelemetryRange(this.apiValue, this.label);

  final String apiValue;
  final String label;
}

@immutable
class TelemetryPoint {
  const TelemetryPoint({required this.time, this.temperature, this.humidity});

  final DateTime time;
  final double? temperature;
  final double? humidity;
}

@immutable
class TelemetrySeries {
  const TelemetrySeries({
    required this.deviceId,
    required this.range,
    required this.bucketSeconds,
    required this.points,
    this.latest,
  });

  final int deviceId;
  final TelemetryRange range;
  final int bucketSeconds;

  /// Oldest → newest.
  final List<TelemetryPoint> points;
  final Reading? latest;

  bool get isEmpty => points.isEmpty;
}
