import '../../../core/utils/json.dart';
import '../../devices/data/device_mapper.dart';
import '../../devices/domain/device.dart';
import '../../rooms/data/room_mapper.dart';
import '../domain/home.dart';
import '../domain/home_role.dart';
import '../domain/overview.dart';

/// Contract §3 `Home`.
Home homeFromJson(Json json) => Home(
  id: json.readInt('id'),
  name: json.readString('name', fallback: 'Smart Home'),
  address: json.readStringOrNull('address'),
  package: json.readString('package', fallback: 'KIT_A'),
  status: HomeStatus.fromApi(json.readStringOrNull('status')),
  timezone: json.readString('timezone', fallback: 'Asia/Ho_Chi_Minh'),
  ownerCustomerId: json.readIntOrNull('owner_customer_id'),
  gatewayId: json.readIntOrNull('gateway_id'),
  activatedAt: json.readDateOrNull('activated_at'),
  createdAt: json.readDateOrNull('created_at'),
);

/// `GET /homes` item: `{ home, role, device_count, online_count, expires_at }`.
MyHome myHomeFromJson(Json json) => MyHome(
  home: homeFromJson(json.readObject('home')),
  role: HomeRole.fromApi(json.readStringOrNull('role')),
  deviceCount: json.readIntOrNull('device_count') ?? 0,
  onlineCount: json.readIntOrNull('online_count') ?? 0,
  expiresAt: json.readDateOrNull('expires_at'),
);

GatewayInfo? gatewayFromJson(Json? json) {
  if (json == null) return null;
  return GatewayInfo(
    id: json.readIntOrNull('id') ?? 0,
    uid: json.readString('uid'),
    online: json.readString('status') == 'online',
    lastSeen: json.readDateOrNull('last_seen'),
  );
}

/// `GET /homes/:homeId/overview` (contract §4.2).
HomeOverview overviewFromJson(Json json) {
  final rooms = json.readObjectList('rooms').map(roomFromJson).toList()
    ..sort((a, b) {
      final byOrder = a.sortOrder.compareTo(b.sortOrder);
      return byOrder != 0 ? byOrder : a.id.compareTo(b.id);
    });
  final devices = json
      .readObjectList('devices')
      .map(deviceFromJson)
      .where((device) => device.category != DeviceCategory.gateway)
      .toList();
  return HomeOverview(
    home: homeFromJson(json.readObject('home')),
    role: HomeRole.fromApi(json.readStringOrNull('role')),
    gateway: gatewayFromJson(json.readObjectOrNull('gateway')),
    rooms: rooms,
    devices: devices,
    openAlerts: json.readIntOrNull('open_alerts') ?? 0,
    pendingSuggestions: json.readIntOrNull('pending_suggestions') ?? 0,
    unreadNotifications: json.readIntOrNull('unread_notifications') ?? 0,
  );
}
