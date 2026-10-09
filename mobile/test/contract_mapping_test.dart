import 'package:flutter_test/flutter_test.dart';
import 'package:smart_home_mobile/core/utils/json.dart';
import 'package:smart_home_mobile/features/automation/data/automation_mapper.dart';
import 'package:smart_home_mobile/features/automation/domain/automation_rule.dart';
import 'package:smart_home_mobile/features/devices/data/device_mapper.dart';
import 'package:smart_home_mobile/features/devices/domain/device.dart';
import 'package:smart_home_mobile/features/homes/data/home_mapper.dart';
import 'package:smart_home_mobile/features/homes/domain/home_role.dart';
import 'package:smart_home_mobile/features/members/data/member_mapper.dart';
import 'package:smart_home_mobile/features/notifications/data/notification_mapper.dart';
import 'package:smart_home_mobile/features/notifications/domain/app_notification.dart';
import 'package:smart_home_mobile/features/shell/data/realtime_event_mapper.dart';
import 'package:smart_home_mobile/features/shell/domain/realtime_event.dart';
import 'package:smart_home_mobile/core/realtime/realtime_source.dart';

const _home = {
  'id': 1,
  'name': 'Nhà của Đạt',
  'address': null,
  'package': 'KIT_A',
  'status': 'active',
  'timezone': 'Asia/Ho_Chi_Minh',
  'owner_customer_id': 1,
  'gateway_id': 3,
  'activated_at': '2026-09-01T03:00:00.000Z',
  'created_at': '2026-08-01T03:00:00.000Z',
};

Map<String, dynamic> _device(int id, String category, {bool? power}) => {
  'id': id,
  'device_uid': 'ESP32-XX-0000000000$id',
  'device_name': 'Thiết bị $id',
  'category': category,
  'home_id': 1,
  'room_id': 5,
  'room_name': 'Phòng khách',
  'status': 'active',
  'online': true,
  'last_seen': '2026-10-05 08:00:00',
  'power': power,
  'latest': category == 'sensor'
      ? {
          'temperature': '28.40',
          'humidity': 65,
          'door_open': null,
          'received_at': '2026-10-05T08:00:00.000Z',
        }
      : null,
  'can_control': category == 'relay',
};

void main() {
  test('overview JSON (contract §4.2) maps to the domain model', () {
    final overview = overviewFromJson(
      asJson({
        'home': _home,
        'role': 'CONTROLLER',
        'gateway': {
          'id': 3,
          'uid': 'ESP32-GW-A1',
          'status': 'offline',
          'last_seen': '2026-10-05T05:00:00.000Z',
        },
        'rooms': [
          {
            'id': 5,
            'home_id': 1,
            'name': 'Phòng khách',
            'room_type': 'living_room',
            'sort_order': 1,
            'temperature': 28.4,
            'humidity': '65',
            'has_climate_data': true,
            'climate_updated_at': '2026-10-05T08:00:00.000Z',
            'device_count': 2,
            'online_count': 2,
            'on_count': 1,
          },
        ],
        'devices': [
          _device(10, 'sensor'),
          _device(11, 'relay', power: true),
          _device(12, 'gateway'),
        ],
        'open_alerts': 2,
        'pending_suggestions': 1,
        'unread_notifications': 4,
      }),
    );

    expect(overview.home.name, 'Nhà của Đạt');
    expect(overview.role, HomeRole.controller);
    expect(overview.gatewayOffline, isTrue);
    expect(overview.devices.map((d) => d.id), [10, 11]); // gateway row dropped
    expect(overview.rooms.single.humidity, 65.0);
    expect(overview.rooms.single.hasClimateData, isTrue);
    expect(overview.openAlerts, 2);
    expect(overview.onCount, 1);
    final relay = overview.deviceById(11)!;
    expect(relay.isRelay && relay.isOn && relay.canControl, isTrue);
    expect(relay.lastSeen!.isUtc, isTrue); // zone-less timestamps are UTC
    expect(overview.deviceById(10)!.latest!.temperature, 28.4);
  });

  test('device_state / telemetry / notification / home_changed events', () {
    final state = parseRealtimeEvent(
      RealtimeMessage('device_state', {
        'type': 'device_state',
        'home_id': 1,
        'device': {
          'id': 11,
          'room_id': 5,
          'online': true,
          'last_seen': '2026-10-05T08:00:00.000Z',
          'power': false,
          'status': 'active',
        },
      }),
    );
    expect(state, isA<DeviceStateEvent>());
    expect((state! as DeviceStateEvent).power, isFalse);

    final telemetry = parseRealtimeEvent(
      RealtimeMessage('telemetry', {
        'type': 'telemetry',
        'home_id': 1,
        'room_id': 5,
        'device_id': 10,
        'reading': {'temperature': 29.1, 'humidity': 60, 'received_at': '2026-10-05T08:01:00Z'},
      }),
    );
    expect((telemetry! as TelemetryEvent).reading.temperature, 29.1);

    final notification = parseRealtimeEvent(
      RealtimeMessage('notification', {
        'type': 'notification',
        'home_id': 1,
        'notification': {
          'id': 9,
          'home_id': 1,
          'home_name': 'Nhà của Đạt',
          'type': 'DOOR_OPENED',
          'title': 'Cửa chính vừa được mở',
          'message': 'm',
          'severity': 'warning',
          'is_read': false,
          'created_at': '2026-10-05T08:02:00Z',
        },
      }),
    );
    expect(
      (notification! as NotificationEvent).notification.severity,
      Severity.warning,
    );

    expect(
      parseRealtimeEvent(
        RealtimeMessage('home_changed', {'type': 'home_changed', 'home_id': 2}),
      ),
      isA<HomeChangedEvent>(),
    );
    expect(
      parseRealtimeEvent(RealtimeMessage('future_event', {'home_id': 1})),
      isNull,
    );
  });

  test('members, invitations, rules, suggestions and telemetry', () {
    final member = memberFromJson(
      asJson({
        'id': 4,
        'home_id': 1,
        'user_id': null,
        'name': 'Minh',
        'initials': 'M',
        'email': 'minh@smarthome.local',
        'role': 'GUEST',
        'is_me': false,
        'pending': true,
        'invite_expires_at': '2026-10-12T00:00:00Z',
        'expires_at': '2026-10-08T00:00:00Z',
        'guest_device_ids': [11],
        'joined_at': null,
      }),
    );
    expect(member.pending && member.role == HomeRole.guest, isTrue);
    expect(member.guestDeviceIds, [11]);

    final invitation = invitationFromJson(
      asJson({
        'id': 8,
        'home': {'id': 1, 'name': 'Nhà của Đạt', 'address': null},
        'role': 'VIEWER',
        'invited_by_name': 'Nguyễn Hoàng Đạt',
        'invite_expires_at': '2026-10-12T00:00:00Z',
        'expires_at': null,
      }),
    );
    expect(invitation.homeName, 'Nhà của Đạt');
    expect(invitation.role, HomeRole.viewer);

    final rule = ruleFromJson(
      asJson({
        'id': 1,
        'home_id': 1,
        'home_name': 'Nhà của Đạt',
        'name': 'Tắt đèn bếp',
        'enabled': true,
        'trigger_type': 'schedule',
        'trigger_room_id': null,
        'trigger_room_name': null,
        'trigger_metric': null,
        'trigger_operator': null,
        'trigger_threshold': null,
        'schedule_time': '23:30',
        'schedule_days': [1, 2, 3, 4, 5, 6, 7],
        'action_device_id': 12,
        'action_device_name': 'Đèn nhà bếp',
        'action_command': 'turn_off',
        'origin': 'ai_suggested',
        'created_by_user_id': 7,
        'created_by_name': 'Đạt',
        'last_triggered_at': null,
        'created_at': '2026-10-01T00:00:00Z',
        'can_edit': true,
        'can_delete': false,
      }),
    );
    expect(rule.triggerType, TriggerType.schedule);
    expect(rule.actionCommand, RuleAction.turnOff);
    expect(rule.origin, RuleOrigin.aiSuggested);
    expect(rule.canEdit && !rule.canDelete, isTrue);

    final draftJson = ruleDraftToJson(
      const RuleDraft(
        name: ' x ',
        triggerType: TriggerType.sensorThreshold,
        actionDeviceId: 3,
        actionCommand: RuleAction.turnOn,
        triggerRoomId: 5,
        triggerMetric: TriggerMetric.temperature,
        triggerOperator: TriggerOperator.greater,
        triggerThreshold: 30,
      ),
    );
    expect(draftJson['trigger_operator'], '>');
    expect(draftJson['name'], 'x');
    expect(draftJson.containsKey('schedule_time'), isFalse);

    final suggestion = suggestionFromJson(
      asJson({
        'id': 1,
        'home_id': 1,
        'device_id': 11,
        'device_name': 'Đèn phòng khách',
        'room_name': 'Phòng khách',
        'action': 'turn_off',
        'time_of_day': '23:00',
        'days_matched': 6,
        'window_days': 7,
        'status': 'pending',
        'created_at': '2026-10-03T00:00:00Z',
        'responded_at': null,
        'rule_id': null,
      }),
    );
    expect(suggestion.isPending, isTrue);

    final series = telemetryFromJson(
      asJson({
        'device_id': 10,
        'range': '7d',
        'bucket_seconds': 3600,
        'points': [
          {'t': '2026-10-05T07:00:00Z', 'temperature': 28.1, 'humidity': null},
        ],
        'latest': null,
      }),
      TelemetryRange.last24Hours,
    );
    expect(series.range, TelemetryRange.last7Days);
    expect(series.points.single.humidity, isNull);

    final page = notificationsPageFromJson(
      asJson({
        'notifications': [
          {
            'id': 1,
            'home_id': null,
            'home_name': null,
            'type': 'X',
            'title': 't',
            'message': 'm',
            'severity': 'critical',
            'is_read': true,
            'created_at': '2026-10-05T00:00:00Z',
          },
        ],
        'unread_count': 3,
      }),
    );
    expect(page.unreadCount, 3);
    expect(page.items.single.severity.isAlert, isTrue);

    final command = commandResultFromJson(
      asJson({
        'command': {
          'id': 5,
          'action': 'turn_on',
          'status': 'acked',
          'issued_at': '2026-10-05T08:00:00Z',
          'acked_at': '2026-10-05T08:00:01Z',
        },
        'device': _device(11, 'relay', power: true),
      }),
    );
    expect(command.action, PowerAction.turnOn);
    expect(command.device.isOn, isTrue);

    final mine = myHomeFromJson(
      asJson({
        'home': _home,
        'role': 'OWNER',
        'device_count': 7,
        'online_count': 6,
        'expires_at': null,
      }),
    );
    expect(mine.role, HomeRole.owner);
    expect(mine.deviceCount, 7);
  });
}
