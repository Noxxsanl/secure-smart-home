import '../../../core/utils/date_format.dart';
import 'automation_rule.dart';

/// Vietnamese wording for a weekday set (ISO 1 = Monday … 7 = Sunday).
String describeDays(List<int>? days) {
  final sorted = {...?days}.where((d) => d >= 1 && d <= 7).toList()..sort();
  if (sorted.isEmpty) return 'hằng ngày';
  if (sorted.length == 7) return 'hằng ngày';
  if (_sameDays(sorted, const [1, 2, 3, 4, 5])) {
    return 'các ngày trong tuần (T2–T6)';
  }
  if (_sameDays(sorted, const [6, 7])) return 'vào cuối tuần (T7, CN)';
  return 'vào ${sorted.map(shortWeekday).join(', ')}';
}

bool _sameDays(List<int> a, List<int> b) =>
    a.length == b.length && [for (var i = 0; i < a.length; i++) a[i] == b[i]]
        .every((same) => same);

/// One-line explanation of what a rule does (FR-7.1), e.g.
/// "Khi nhiệt độ Phòng ngủ cao hơn 30°C thì bật Quạt phòng ngủ." or
/// "Lúc 23:30 hằng ngày thì tắt Đèn nhà bếp."
String describeRule(AutomationRule rule) {
  final device = rule.actionDeviceName ?? 'thiết bị đã bị xoá';
  final action = '${rule.actionCommand.verb} $device';

  switch (rule.triggerType) {
    case TriggerType.schedule:
      final time = rule.scheduleTime ?? '--:--';
      return 'Lúc $time ${describeDays(rule.scheduleDays)} thì $action.';
    case TriggerType.sensorThreshold:
      final metric = rule.triggerMetric;
      final operator = rule.triggerOperator;
      final threshold = rule.triggerThreshold;
      final room = rule.triggerRoomName ?? 'phòng đã bị xoá';
      if (metric == null || operator == null || threshold == null) {
        return 'Quy tắc theo cảm biến chưa đầy đủ điều kiện.';
      }
      final value = '${formatNumber(threshold)}${metric.unit}';
      return 'Khi ${metric.noun} $room ${operator.phrase} $value '
          'thì $action.';
  }
}

/// Plain-language explanation of an AI suggestion card (docs/07 §14: natural
/// behaviour wording, no technical terms).
String describeSuggestion({
  required RuleAction action,
  required String deviceName,
  required String timeOfDay,
  required int daysMatched,
  required int windowDays,
}) {
  return 'Bạn thường ${action.verb} $deviceName vào lúc $timeOfDay '
      '($daysMatched/$windowDays ngày gần đây).';
}
