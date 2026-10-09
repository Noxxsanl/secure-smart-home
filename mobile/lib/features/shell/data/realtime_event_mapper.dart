import '../../../core/realtime/realtime_source.dart';
import '../../../core/utils/json.dart';
import '../../devices/data/device_mapper.dart';
import '../../devices/domain/device.dart';
import '../../notifications/data/notification_mapper.dart';
import '../domain/realtime_event.dart';

/// Parses a WebSocket frame into a typed event, or `null` for unknown frames
/// (forward compatibility: new server event types are ignored).
RealtimeEvent? parseRealtimeEvent(RealtimeMessage message) {
  try {
    final json = message.data;
    final homeId = json.readIntOrNull('home_id');
    if (homeId == null) return null;
    switch (message.type) {
      case 'device_state':
        final device = json.readObject('device');
        final statusValue = device.readStringOrNull('status');
        return DeviceStateEvent(
          homeId: homeId,
          deviceId: device.readInt('id'),
          roomId: device.readIntOrNull('room_id'),
          online: device.readBoolOrNull('online'),
          lastSeen: device.readDateOrNull('last_seen'),
          power: device.readBoolOrNull('power'),
          status: statusValue == null ? null : DeviceStatus.fromApi(statusValue),
        );
      case 'telemetry':
        return TelemetryEvent(
          homeId: homeId,
          deviceId: json.readInt('device_id'),
          roomId: json.readIntOrNull('room_id'),
          reading: readingFromJson(json.readObject('reading')),
        );
      case 'notification':
        return NotificationEvent(
          homeId: homeId,
          notification: notificationFromJson(json.readObject('notification')),
        );
      case 'home_changed':
        return HomeChangedEvent(homeId: homeId);
    }
  } on FormatException {
    return null;
  }
  return null;
}
