import '../../../core/utils/json.dart';
import '../../devices/devices.dart' show ApplianceKind;
import '../domain/schedule.dart';

/// Contract §2 `Schedule`. Unknown `action` / `status` values do not break the
/// list (they become [ScheduleAction.unknown] / [ScheduleStatus.unknown]).
Schedule scheduleFromJson(Json json) => Schedule(
  id: json.readInt('id'),
  homeId: json.readIntOrNull('home_id') ?? 0,
  timezone: json.readString('timezone', fallback: 'Asia/Ho_Chi_Minh'),
  deviceId: json.readIntOrNull('device_id'),
  deviceName: json.readStringOrNull('device_name'),
  roomName: json.readStringOrNull('room_name'),
  appliance: ApplianceKind.fromApi(json.readStringOrNull('appliance')),
  action: ScheduleAction.fromApi(json.readStringOrNull('action')),
  temperature: json.readIntOrNull('temperature'),
  position: json.readIntOrNull('position'),
  actionLabel: json.readString('action_label', fallback: 'Hẹn giờ'),
  runAt:
      json.readDateOrNull('run_at') ??
      DateTime.fromMillisecondsSinceEpoch(0, isUtc: true),
  status: ScheduleStatus.fromApi(json.readStringOrNull('status')),
  origin: ScheduleOrigin.fromApi(json.readStringOrNull('origin')),
  channel: json.readString('channel', fallback: 'web'),
  createdByUserId: json.readIntOrNull('created_by_user_id'),
  createdByName: json.readStringOrNull('created_by_name'),
  errorCode: json.readStringOrNull('error_code'),
  executedAt: json.readDateOrNull('executed_at'),
  cancelledAt: json.readDateOrNull('cancelled_at'),
  createdAt: json.readDateOrNull('created_at'),
  canCancel: json.readBool('can_cancel'),
);

/// `GET /homes/:id/schedules` → `{ items: Schedule[] }`.
List<Schedule> scheduleListFromJson(Object? data) {
  final items = asJson(data).readObjectList('items');
  return [for (final item in items) scheduleFromJson(item)];
}
