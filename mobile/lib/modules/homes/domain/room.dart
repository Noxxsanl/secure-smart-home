import 'package:flutter/foundation.dart';

import '../../devices/devices.dart';
import 'home.dart';
import 'home_role.dart';

/// A room with its climate summary (contract §3 `RoomSummary`).
@immutable
class RoomSummary {
  const RoomSummary({
    required this.id,
    required this.homeId,
    required this.name,
    required this.roomType,
    this.sortOrder = 0,
    this.temperature,
    this.humidity,
    this.hasClimateData = false,
    this.climateUpdatedAt,
    this.deviceCount = 0,
    this.onlineCount = 0,
    this.onCount = 0,
  });

  final int id;
  final int homeId;
  final String name;

  /// `living_room|bedroom|kitchen|bathroom|office|garage|garden|door`.
  final String roomType;
  final int sortOrder;
  final double? temperature;
  final double? humidity;
  final bool hasClimateData;
  final DateTime? climateUpdatedAt;

  /// Counts exclude gateway rows.
  final int deviceCount;
  final int onlineCount;
  final int onCount;

  RoomSummary copyWith({
    String? name,
    double? temperature,
    double? humidity,
    bool? hasClimateData,
    DateTime? climateUpdatedAt,
    int? deviceCount,
    int? onlineCount,
    int? onCount,
  }) => RoomSummary(
    id: id,
    homeId: homeId,
    name: name ?? this.name,
    roomType: roomType,
    sortOrder: sortOrder,
    temperature: temperature ?? this.temperature,
    humidity: humidity ?? this.humidity,
    hasClimateData: hasClimateData ?? this.hasClimateData,
    climateUpdatedAt: climateUpdatedAt ?? this.climateUpdatedAt,
    deviceCount: deviceCount ?? this.deviceCount,
    onlineCount: onlineCount ?? this.onlineCount,
    onCount: onCount ?? this.onCount,
  );

  /// Recomputes the device counters from [devices] (after a local change).
  RoomSummary withCounts(Iterable<CustomerDevice> devices) {
    final inRoom = devices
        .where((d) => d.roomId == id && d.category != DeviceCategory.gateway)
        .toList();
    return copyWith(
      deviceCount: inRoom.length,
      onlineCount: inRoom.where((d) => d.online).length,
      onCount: inRoom.where((d) => d.isRelay && d.isOn).length,
    );
  }
}

/// `GET /rooms/:id` (contract §4.2).
@immutable
class RoomDetail {
  const RoomDetail({
    required this.room,
    required this.home,
    required this.role,
    required this.devices,
  });

  final RoomSummary room;
  final Home home;
  final HomeRole role;
  final List<CustomerDevice> devices;
}
