import '../../devices/devices.dart';
import '../../notifications/notifications.dart';

/// Typed server push (contract §4.3). Only homes where the user is an
/// effective member are ever delivered.
sealed class RealtimeEvent {
  const RealtimeEvent(this.homeId);

  final int homeId;
}

/// `{"type":"device_state","home_id","device":{id,room_id,online,last_seen,power,status}}`
class DeviceStateEvent extends RealtimeEvent {
  const DeviceStateEvent({
    required int homeId,
    required this.deviceId,
    this.roomId,
    this.online,
    this.lastSeen,
    this.power,
    this.status,
  }) : super(homeId);

  final int deviceId;
  final int? roomId;
  final bool? online;
  final DateTime? lastSeen;
  final bool? power;
  final DeviceStatus? status;
}

/// `{"type":"telemetry","home_id","room_id","device_id","reading":{…}}`
class TelemetryEvent extends RealtimeEvent {
  const TelemetryEvent({
    required int homeId,
    required this.deviceId,
    required this.reading,
    this.roomId,
  }) : super(homeId);

  final int deviceId;
  final int? roomId;
  final Reading reading;
}

/// `{"type":"notification","home_id","notification":{…}}`
class NotificationEvent extends RealtimeEvent {
  const NotificationEvent({required int homeId, required this.notification})
    : super(homeId);

  final AppNotification notification;
}

/// `{"type":"home_changed","home_id"}` — membership/role/rename/rooms/claim:
/// refetch homes and the overview.
class HomeChangedEvent extends RealtimeEvent {
  const HomeChangedEvent({required int homeId}) : super(homeId);
}
