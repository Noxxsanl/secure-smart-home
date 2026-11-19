import 'package:flutter/foundation.dart';

import 'appliance.dart';
import 'device_command.dart';

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
    this.appliance,
    this.acSetpoint,
    this.acCodes,
    this.curtainPos,
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

  /// What the backend says the relay drives; `null` = not assigned (old data):
  /// [ApplianceKind.of] then guesses from the name, but the extra commands and
  /// the schedule stay closed.
  final ApplianceKind? appliance;

  /// Air conditioner set point 16..30 °C the Node last sent; `null` = unknown.
  final int? acSetpoint;

  /// Bitmask of learned IR codes: bit 0 = OFF, bit (t − 15) = t °C
  /// (`domain/ac_codes.dart`); `null` = the Node has not reported it.
  final int? acCodes;

  /// Curtain position 0..100 (0 = closed); `null` = unknown.
  final int? curtainPos;

  bool get isRelay => category == DeviceCategory.relay;
  bool get isSensor => category == DeviceCategory.sensor;
  bool get isDoorContact => category == DeviceCategory.doorContact;
  bool get isCamera => category == DeviceCategory.camera;
  bool get isOn => power ?? false;
  bool get isBlocked => status == DeviceStatus.blocked;

  /// Only an air conditioner the backend has classified takes `set_temp` and
  /// `learn_code` (a name that merely looks like one does not count).
  bool get isAirConditioner => appliance == ApplianceKind.airConditioner;

  /// A one-off schedule (FR-5.10) is accepted for a controllable relay the
  /// backend has classified as lamp, fan, curtain or air conditioner.
  bool get isSchedulable =>
      isRelay && canControl && (appliance?.isSchedulable ?? false);

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
    ApplianceKind? appliance,
    int? acSetpoint,
    int? acCodes,
    int? curtainPos,
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
    appliance: appliance ?? this.appliance,
    acSetpoint: acSetpoint ?? this.acSetpoint,
    acCodes: acCodes ?? this.acCodes,
    curtainPos: curtainPos ?? this.curtainPos,
  );

  /// Sets the three live relay values exactly as given — `null` included
  /// ("unknown now"). [copyWith] cannot do that: `null` there means "keep".
  /// Used for the realtime `device_state` frame and for undoing an optimistic
  /// change.
  CustomerDevice withLiveValues({
    required int? acSetpoint,
    required int? acCodes,
    required int? curtainPos,
  }) => CustomerDevice(
    id: id,
    deviceUid: deviceUid,
    name: name,
    category: category,
    homeId: homeId,
    roomId: roomId,
    roomName: roomName,
    status: status,
    online: online,
    lastSeen: lastSeen,
    power: power,
    latest: latest,
    canControl: canControl,
    appliance: appliance,
    acSetpoint: acSetpoint,
    acCodes: acCodes,
    curtainPos: curtainPos,
  );
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

  /// What the server executed (kept as sent, never turned into another action).
  final CommandAction action;
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
