import 'package:flutter_test/flutter_test.dart';
import 'package:smart_home_mobile/features/automation/domain/automation_rule.dart';
import 'package:smart_home_mobile/features/automation/domain/rule_description.dart';

AutomationRule _rule({
  TriggerType type = TriggerType.schedule,
  TriggerMetric? metric,
  TriggerOperator? operator,
  double? threshold,
  String? room,
  String? time,
  List<int>? days,
  String? device = 'Đèn nhà bếp',
  RuleAction action = RuleAction.turnOff,
}) => AutomationRule(
  id: 1,
  homeId: 1,
  name: 'r',
  enabled: true,
  triggerType: type,
  triggerMetric: metric,
  triggerOperator: operator,
  triggerThreshold: threshold,
  triggerRoomName: room,
  scheduleTime: time,
  scheduleDays: days,
  actionDeviceName: device,
  actionCommand: action,
  origin: RuleOrigin.user,
  canEdit: true,
  canDelete: true,
);

void main() {
  test('sensor rule reads naturally', () {
    final rule = _rule(
      type: TriggerType.sensorThreshold,
      metric: TriggerMetric.temperature,
      operator: TriggerOperator.greater,
      threshold: 30,
      room: 'Phòng ngủ',
      device: 'Quạt phòng ngủ',
      action: RuleAction.turnOn,
    );
    expect(
      describeRule(rule),
      'Khi nhiệt độ Phòng ngủ cao hơn 30°C thì bật Quạt phòng ngủ.',
    );
  });

  test('humidity rule with decimals and "<"', () {
    final rule = _rule(
      type: TriggerType.sensorThreshold,
      metric: TriggerMetric.humidity,
      operator: TriggerOperator.less,
      threshold: 45.5,
      room: 'Nhà bếp',
    );
    expect(
      describeRule(rule),
      'Khi độ ẩm Nhà bếp thấp hơn 45,5% thì tắt Đèn nhà bếp.',
    );
  });

  test('schedule rule: every day, weekdays, weekend, custom days', () {
    expect(
      describeRule(_rule(time: '23:30', days: const [1, 2, 3, 4, 5, 6, 7])),
      'Lúc 23:30 hằng ngày thì tắt Đèn nhà bếp.',
    );
    expect(
      describeRule(_rule(time: '06:30', days: const [5, 4, 3, 2, 1])),
      'Lúc 06:30 các ngày trong tuần (T2–T6) thì tắt Đèn nhà bếp.',
    );
    expect(
      describeRule(_rule(time: '09:00', days: const [6, 7])),
      'Lúc 09:00 vào cuối tuần (T7, CN) thì tắt Đèn nhà bếp.',
    );
    expect(
      describeRule(_rule(time: '18:15', days: const [1, 3, 7])),
      'Lúc 18:15 vào T2, T4, CN thì tắt Đèn nhà bếp.',
    );
  });

  test('deleted device / incomplete sensor rule do not crash', () {
    expect(
      describeRule(_rule(time: '07:00', days: const [1], device: null)),
      contains('thiết bị đã bị xoá'),
    );
    expect(
      describeRule(_rule(type: TriggerType.sensorThreshold)),
      contains('chưa đầy đủ'),
    );
  });

  test('AI suggestion wording', () {
    expect(
      describeSuggestion(
        action: RuleAction.turnOff,
        deviceName: 'Đèn phòng khách',
        timeOfDay: '23:00',
        daysMatched: 6,
        windowDays: 7,
      ),
      'Bạn thường tắt Đèn phòng khách vào lúc 23:00 (6/7 ngày gần đây).',
    );
  });
}
