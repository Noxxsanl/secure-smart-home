import 'package:flutter/foundation.dart';

import '../../devices/domain/device.dart';
import '../../rooms/domain/room.dart';
import 'home.dart';
import 'home_role.dart';

@immutable
class GatewayInfo {
  const GatewayInfo({
    required this.id,
    required this.uid,
    required this.online,
    this.lastSeen,
  });

  final int id;
  final String uid;
  final bool online;
  final DateTime? lastSeen;

  GatewayInfo copyWith({bool? online, DateTime? lastSeen}) => GatewayInfo(
    id: id,
    uid: uid,
    online: online ?? this.online,
    lastSeen: lastSeen ?? this.lastSeen,
  );
}

/// `GET /homes/:homeId/overview` (contract §4.2): everything the Home and
/// Rooms tabs need, and the single source of truth for live device state.
@immutable
class HomeOverview {
  const HomeOverview({
    required this.home,
    required this.role,
    required this.rooms,
    required this.devices,
    this.gateway,
    this.openAlerts = 0,
    this.pendingSuggestions = 0,
    this.unreadNotifications = 0,
  });

  final Home home;
  final HomeRole role;
  final GatewayInfo? gateway;
  final List<RoomSummary> rooms;

  /// Non-gateway devices visible to the caller.
  final List<CustomerDevice> devices;

  /// Unread warning + critical notifications.
  final int openAlerts;
  final int pendingSuggestions;
  final int unreadNotifications;

  List<CustomerDevice> get relays => devices.where((d) => d.isRelay).toList();
  int get onCount => devices.where((d) => d.isRelay && d.isOn).length;
  int get onlineCount => devices.where((d) => d.online).length;

  /// FR-5.5 banner: gateway unreachable → device data may be stale.
  bool get gatewayOffline => gateway != null && !gateway!.online;

  RoomSummary? roomById(int id) {
    for (final room in rooms) {
      if (room.id == id) return room;
    }
    return null;
  }

  CustomerDevice? deviceById(int id) {
    for (final device in devices) {
      if (device.id == id) return device;
    }
    return null;
  }

  List<CustomerDevice> devicesInRoom(int roomId) =>
      devices.where((d) => d.roomId == roomId).toList();

  HomeOverview copyWith({
    Home? home,
    GatewayInfo? gateway,
    List<RoomSummary>? rooms,
    List<CustomerDevice>? devices,
    int? openAlerts,
    int? pendingSuggestions,
    int? unreadNotifications,
  }) => HomeOverview(
    home: home ?? this.home,
    role: role,
    gateway: gateway ?? this.gateway,
    rooms: rooms ?? this.rooms,
    devices: devices ?? this.devices,
    openAlerts: openAlerts ?? this.openAlerts,
    pendingSuggestions: pendingSuggestions ?? this.pendingSuggestions,
    unreadNotifications: unreadNotifications ?? this.unreadNotifications,
  );

  /// Replaces (or appends) one device and recomputes the room counters.
  HomeOverview upsertDevice(CustomerDevice device) {
    final exists = devices.any((d) => d.id == device.id);
    final next = exists
        ? [for (final d in devices) d.id == device.id ? device : d]
        : [...devices, device];
    return copyWith(
      devices: next,
      rooms: [for (final room in rooms) room.withCounts(next)],
    );
  }

  HomeOverview upsertRoom(RoomSummary room) {
    final exists = rooms.any((r) => r.id == room.id);
    return copyWith(
      rooms: exists
          ? [for (final r in rooms) r.id == room.id ? room : r]
          : [...rooms, room],
    );
  }
}
