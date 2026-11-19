import '../../../core/utils/home_time.dart';
import 'assistant_schedule.dart';
import 'assistant_texts.dart';

// How the Assistant words schedules: times in the HOME's timezone (never the
// phone's), status labels and the reason a step did not run. Same words as the
// web (`@shh/ai` model/scheduleView.ts).

/// "20:00 hôm nay" / "20:00 ngày mai" / "20:00 · 16/11" in [timezone].
String formatRunAt(DateTime instant, String timezone, DateTime now) =>
    HomeClock(timezone).formatRunAt(instant, now: now);

/// "4:32" until [expiresAt]; `null` once it has passed.
String? countdownClock(DateTime expiresAt, DateTime now) {
  final diff = expiresAt.difference(now);
  if (diff <= Duration.zero) return null;
  final total = (diff.inMilliseconds / 1000).ceil();
  final seconds = total % 60;
  return '${total ~/ 60}:${seconds.toString().padLeft(2, '0')}';
}

bool isExpired(DateTime expiresAt, DateTime now) => !expiresAt.isAfter(now);

String _capitalize(String text) =>
    text.isEmpty ? text : text[0].toUpperCase() + text.substring(1);

/// A full sentence explaining why a step did not run as expected; `null` when
/// there is nothing to explain.
String? resultReason(AssistantSchedule schedule) {
  if (schedule.status == AssistantScheduleStatus.missed) {
    return 'Hệ thống tạm dừng đúng giờ chạy nên lịch không chạy bù.';
  }
  final explained =
      schedule.status == AssistantScheduleStatus.failed ||
      schedule.status == AssistantScheduleStatus.skipped ||
      schedule.status == AssistantScheduleStatus.cancelled;
  final code = schedule.errorCode;
  if (!explained || code == null || code.isEmpty) return null;
  return '${_capitalize(scheduleReasons[code] ?? scheduleReasons['UNKNOWN']!)}.';
}

/// Outcome label of one step.
String resultLabel(AssistantSchedule schedule, DateTime now) =>
    switch (schedule.status) {
      AssistantScheduleStatus.done => 'Đã thực hiện',
      AssistantScheduleStatus.scheduled =>
        'Đã hẹn ${formatRunAt(schedule.runAt, schedule.timezone, now)}',
      AssistantScheduleStatus.running => 'Đang thực hiện',
      AssistantScheduleStatus.skipped => 'Không cần thực hiện',
      AssistantScheduleStatus.failed => 'Không thực hiện được',
      AssistantScheduleStatus.cancelled => 'Đã huỷ',
      AssistantScheduleStatus.missed => 'Bị bỏ lỡ',
      AssistantScheduleStatus.unknown => 'Không rõ kết quả',
    };
