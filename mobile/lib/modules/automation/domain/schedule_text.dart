import '../../../core/utils/home_time.dart';
import 'schedule.dart';

// Vietnamese wording of the one-off schedule (same sentences as the web,
// `@shh/automation` model/scheduledAction.ts).

/// "còn 25 phút" / "còn 2 giờ 10 phút" / "còn 3 ngày"; past due but not run yet
/// → "đang chuẩn bị chạy".
String countdownText(DateTime runAt, DateTime now) {
  final diff = runAt.difference(now);
  if (diff <= Duration.zero) return 'đang chuẩn bị chạy';
  final minutes = (diff.inMilliseconds / 60000).ceil();
  if (minutes < 60) {
    return minutes <= 1 ? 'còn dưới 1 phút' : 'còn $minutes phút';
  }
  if (minutes < 24 * 60) {
    final hours = minutes ~/ 60;
    final rest = minutes % 60;
    return rest == 0 ? 'còn $hours giờ' : 'còn $hours giờ $rest phút';
  }
  return 'còn ${minutes ~/ (24 * 60)} ngày';
}

/// "20:00 hôm nay" / "20:00 ngày mai" / "20:00 · 16/11" in the schedule's home.
String scheduleRunAtText(Schedule schedule, DateTime now) =>
    HomeClock(schedule.timezone).formatRunAt(schedule.runAt, now: now);

/// "20:00 hôm nay · còn 25 phút" for the upcoming list.
String scheduleWhenWithCountdown(Schedule schedule, DateTime now) =>
    '${scheduleRunAtText(schedule, now)} · ${countdownText(schedule.runAt, now)}';

const _reasons = <String, String>{
  'DEVICE_OFFLINE': 'thiết bị đang ngoại tuyến',
  'TIMEOUT': 'thiết bị không phản hồi',
  'COMMAND_FAILED': 'thiết bị báo lỗi',
  'DEVICE_BLOCKED': 'thiết bị đang bị chặn',
  'HOME_SUSPENDED': 'nhà đang tạm ngưng',
  'NOT_CONTROLLABLE': 'thiết bị không còn điều khiển được theo cách này',
  'NO_DEVICE': 'thiết bị đã bị xoá',
  'ACCESS_REVOKED': 'người tạo lịch không còn quyền điều khiển thiết bị',
  'ALREADY_IN_STATE':
      'thiết bị đã ở trạng thái mong muốn nên không cần gửi lệnh',
  'INTERRUPTED': 'hệ thống bị gián đoạn lúc đang chạy',
  'UNKNOWN': 'lỗi không xác định',
};

/// Why a finished schedule did not run as expected ("Thiết bị đang ngoại
/// tuyến."); `null` when no explanation is needed.
String? scheduleReason(Schedule schedule) {
  final status = schedule.status;
  if (status == ScheduleStatus.missed) {
    return 'Hệ thống tạm dừng đúng giờ chạy nên lịch không chạy bù.';
  }
  if (status != ScheduleStatus.failed &&
      status != ScheduleStatus.skipped &&
      status != ScheduleStatus.cancelled) {
    return null;
  }
  final code = schedule.errorCode;
  if (code == null || code.isEmpty) return null;
  final reason = _reasons[code] ?? _reasons['UNKNOWN']!;
  return '${reason[0].toUpperCase()}${reason.substring(1)}.';
}

/// Error wording of the schedule screens; pass as `overrides:` to
/// `userMessageFor` (it wins over the shared table, which stays untouched).
const scheduleErrors = <String, String>{
  'INVALID_INPUT':
      'Hẹn giờ chưa hợp lệ. Hãy chọn thời điểm từ 30 giây tới tối đa 7 ngày '
      'sau, và nhiệt độ điều hoà trong khoảng 16–30 °C.',
  'INVALID_WHEN':
      'Thời điểm chưa hợp lệ. Hãy chọn giờ từ 30 giây tới tối đa 7 ngày sau.',
  'MISSING_FIELDS':
      'Còn thiếu thông tin. Hãy chọn thiết bị, thao tác và thời điểm chạy.',
  'NOT_CONTROLLABLE':
      'Thiết bị này không hẹn giờ được thao tác đã chọn. Hãy chọn thao tác '
      'khác hoặc thiết bị khác.',
  'FORBIDDEN':
      'Vai trò của bạn không cho phép hẹn giờ thiết bị này. Chủ nhà và người '
      'điều khiển hẹn được mọi thiết bị; khách chỉ hẹn được thiết bị được chỉ '
      'định.',
  'NOT_FOUND':
      'Không tìm thấy thiết bị hoặc lịch này nữa. Danh sách sẽ được làm mới.',
  'HOME_SUSPENDED':
      'Dịch vụ của nhà này đang tạm ngưng nên chưa tạo được hẹn giờ. Bạn vẫn '
      'huỷ được các lịch đang chờ.',
  'SCHEDULE_LIMIT':
      'Nhà đã có 50 hẹn giờ đang chờ. Hãy huỷ bớt hoặc chờ một số lịch chạy '
      'xong rồi tạo thêm.',
  'SCHEDULE_NOT_CANCELLABLE':
      'Lịch này đã chạy hoặc đã bị huỷ nên không huỷ được nữa. Danh sách sẽ '
      'được làm mới.',
};

/// Short explanation for the screen when nothing can be scheduled.
const noSchedulableDeviceMessage =
    'Chưa có thiết bị nào hẹn giờ được. Hẹn giờ dùng cho đèn, quạt, rèm cửa và '
    'điều hoà mà bạn có quyền điều khiển.';

/// Subtitle of the schedules screen by what the role may do.
String scheduleIntro({required bool canCreate}) => canCreate
    ? 'Hẹn bật/tắt đèn, quạt, rèm, điều hoà một lần vào giờ đã chọn (tối đa 7 '
          'ngày tới). Khác với tự động hoá lặp lại hằng tuần.'
    : 'Vai trò của bạn chỉ được xem các hẹn giờ của nhà.';
