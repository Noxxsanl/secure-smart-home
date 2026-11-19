import 'package:flutter/foundation.dart';

import '../../../core/utils/home_time.dart';

/// `status` of a one-off schedule the Assistant created or ran.
enum AssistantScheduleStatus {
  scheduled,
  running,
  done,
  skipped,
  failed,
  cancelled,
  missed,

  /// A status this app version does not know.
  unknown;

  static AssistantScheduleStatus fromApi(String? value) {
    for (final status in values) {
      if (status != unknown && status.name == value) return status;
    }
    return unknown;
  }

  /// "Settled" in the user's eyes: ran, is running, or needed no run.
  bool get isSettledOk => this == done || this == running || this == skipped;

  AssistantResultTone get tone => switch (this) {
    done || scheduled || running => AssistantResultTone.ok,
    failed || missed => AssistantResultTone.bad,
    _ => AssistantResultTone.neutral,
  };
}

enum AssistantResultTone { ok, bad, neutral }

/// The few fields of a `Schedule` the Assistant shows. The scheduling module
/// (`automation`) has its own richer type; modules do not import each other's
/// domain, so this one is deliberately minimal.
@immutable
class AssistantSchedule {
  const AssistantSchedule({
    required this.id,
    required this.actionLabel,
    required this.runAt,
    required this.status,
    this.deviceName,
    this.roomName,
    this.errorCode,
    this.canCancel = false,
    this.timezone = defaultHomeTimezone,
  });

  final int id;
  final String? deviceName;
  final String? roomName;

  /// Backend-made label, e.g. "Bật đèn phòng khách" (no room name inside).
  final String actionLabel;
  final DateTime runAt;
  final AssistantScheduleStatus status;
  final String? errorCode;
  final bool canCancel;

  /// IANA timezone of the home — all times are shown in it.
  final String timezone;

  bool get isCancellable =>
      status == AssistantScheduleStatus.scheduled && canCancel;

  AssistantSchedule copyWith({
    AssistantScheduleStatus? status,
    bool? canCancel,
  }) => AssistantSchedule(
    id: id,
    deviceName: deviceName,
    roomName: roomName,
    actionLabel: actionLabel,
    runAt: runAt,
    status: status ?? this.status,
    errorCode: errorCode,
    canCancel: canCancel ?? this.canCancel,
    timezone: timezone,
  );
}
