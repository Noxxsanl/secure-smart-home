import 'package:flutter/foundation.dart';

import '../../devices/devices.dart' show ApplianceKind;

/// `action` of a one-off schedule (FR-5.10) — the commands a schedule can send.
enum ScheduleAction {
  turnOn('turn_on'),
  turnOff('turn_off'),
  setTemp('set_temp'),
  setPos('set_pos'),

  /// An action this app version does not know (kept as is, never rewritten).
  unknown('');

  const ScheduleAction(this.apiValue);

  final String apiValue;

  static ScheduleAction fromApi(String? value) {
    for (final action in values) {
      if (action != unknown && action.apiValue == value) return action;
    }
    return unknown;
  }
}

/// `status` of a schedule. Only [scheduled] and [running] are "upcoming".
enum ScheduleStatus {
  scheduled('scheduled', 'Chờ chạy'),
  running('running', 'Đang chạy'),
  done('done', 'Đã chạy'),
  skipped('skipped', 'Bỏ qua'),
  failed('failed', 'Không chạy được'),
  cancelled('cancelled', 'Đã huỷ'),
  missed('missed', 'Bị bỏ lỡ'),

  /// A status from a newer backend; shown neutrally instead of crashing.
  unknown('', 'Không rõ');

  const ScheduleStatus(this.apiValue, this.label);

  final String apiValue;

  /// Vietnamese label of the status chip (same wording as the web).
  final String label;

  bool get isUpcoming => this == scheduled || this == running;

  static ScheduleStatus fromApi(String? value) {
    for (final status in values) {
      if (status != unknown && status.apiValue == value) return status;
    }
    return unknown;
  }
}

/// Who created a schedule: the user, or the AI assistant on their behalf.
enum ScheduleOrigin {
  user('user'),
  aiAgent('ai_agent');

  const ScheduleOrigin(this.apiValue);

  final String apiValue;

  static ScheduleOrigin fromApi(String? value) =>
      value == aiAgent.apiValue ? aiAgent : user;
}

/// `scope` of `GET /homes/:id/schedules`.
enum ScheduleScope {
  upcoming('upcoming', 100),
  history('history', 50);

  const ScheduleScope(this.apiValue, this.defaultLimit);

  final String apiValue;

  /// Page size the web uses for the same list.
  final int defaultLimit;
}

/// A one-off schedule (contract §2 `Schedule`). Every time is shown in the
/// home's timezone ([timezone]), never the phone's.
@immutable
class Schedule {
  const Schedule({
    required this.id,
    required this.homeId,
    required this.timezone,
    required this.action,
    required this.actionLabel,
    required this.runAt,
    required this.status,
    required this.origin,
    required this.canCancel,
    this.deviceId,
    this.deviceName,
    this.roomName,
    this.appliance,
    this.temperature,
    this.position,
    this.channel = 'web',
    this.createdByUserId,
    this.createdByName,
    this.errorCode,
    this.executedAt,
    this.cancelledAt,
    this.createdAt,
  });

  final int id;
  final int homeId;

  /// IANA name of the home's timezone.
  final String timezone;

  /// `null` once the device was deleted.
  final int? deviceId;
  final String? deviceName;
  final String? roomName;
  final ApplianceKind? appliance;
  final ScheduleAction action;
  final int? temperature;
  final int? position;

  /// Built by the backend, e.g. "Đặt điều hoà 26°C" (no room name).
  final String actionLabel;

  /// UTC instant the schedule runs at.
  final DateTime runAt;
  final ScheduleStatus status;
  final ScheduleOrigin origin;

  /// `web` | `mobile`.
  final String channel;
  final int? createdByUserId;
  final String? createdByName;

  /// Why a finished schedule did not run as expected (`DEVICE_OFFLINE`, …).
  final String? errorCode;
  final DateTime? executedAt;
  final DateTime? cancelledAt;
  final DateTime? createdAt;
  final bool canCancel;

  bool get isAiAgent => origin == ScheduleOrigin.aiAgent;

  Schedule copyWith({
    ScheduleStatus? status,
    String? errorCode,
    DateTime? executedAt,
    DateTime? cancelledAt,
    bool? canCancel,
  }) => Schedule(
    id: id,
    homeId: homeId,
    timezone: timezone,
    deviceId: deviceId,
    deviceName: deviceName,
    roomName: roomName,
    appliance: appliance,
    action: action,
    temperature: temperature,
    position: position,
    actionLabel: actionLabel,
    runAt: runAt,
    status: status ?? this.status,
    origin: origin,
    channel: channel,
    createdByUserId: createdByUserId,
    createdByName: createdByName,
    errorCode: errorCode ?? this.errorCode,
    executedAt: executedAt ?? this.executedAt,
    cancelledAt: cancelledAt ?? this.cancelledAt,
    createdAt: createdAt,
    canCancel: canCancel ?? this.canCancel,
  );
}
