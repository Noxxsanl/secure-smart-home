import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../../core/network/error_messages.dart';
import '../../../../core/theme/app_theme.dart';
import '../../../../core/widgets/app_feedback.dart';
import '../../../../core/widgets/app_widgets.dart';
import '../../../../core/widgets/option_picker.dart';
import '../../../../core/utils/date_format.dart';
import '../../../devices/domain/device.dart';
import '../../../homes/presentation/providers/homes_providers.dart';
import '../../domain/automation_rule.dart';
import '../providers/automation_providers.dart';

/// Create a rule (FR-7.1): threshold (room sensor) or schedule.
class RuleEditorPage extends ConsumerStatefulWidget {
  const RuleEditorPage({super.key, required this.homeId});

  final int homeId;

  @override
  ConsumerState<RuleEditorPage> createState() => _RuleEditorPageState();
}

class _RuleEditorPageState extends ConsumerState<RuleEditorPage> {
  final _formKey = GlobalKey<FormState>();
  final _nameController = TextEditingController();
  final _thresholdController = TextEditingController();

  TriggerType _type = TriggerType.sensorThreshold;
  int? _roomId;
  TriggerMetric _metric = TriggerMetric.temperature;
  TriggerOperator _operator = TriggerOperator.greater;
  TimeOfDay _time = const TimeOfDay(hour: 22, minute: 0);
  final Set<int> _days = {1, 2, 3, 4, 5, 6, 7};
  int? _deviceId;
  RuleAction _action = RuleAction.turnOn;
  bool _busy = false;
  String? _daysError;

  @override
  void dispose() {
    _nameController.dispose();
    _thresholdController.dispose();
    super.dispose();
  }

  String get _timeText => '${twoDigits(_time.hour)}:${twoDigits(_time.minute)}';

  Future<void> _pickTime() async {
    final picked = await showTimePicker(
      context: context,
      initialTime: _time,
      helpText: 'Chọn giờ chạy',
      cancelText: 'Huỷ',
      confirmText: 'Chọn',
      hourLabelText: 'Giờ',
      minuteLabelText: 'Phút',
      builder: (context, child) => MediaQuery(
        data: MediaQuery.of(context).copyWith(alwaysUse24HourFormat: true),
        child: child!,
      ),
    );
    if (picked != null) setState(() => _time = picked);
  }

  Future<void> _save() async {
    final valid = _formKey.currentState!.validate();
    final daysOk = _type == TriggerType.sensorThreshold || _days.isNotEmpty;
    setState(
      () => _daysError = daysOk ? null : 'Chọn ít nhất một ngày trong tuần',
    );
    if (!valid || !daysOk || _busy) return;
    final isThreshold = _type == TriggerType.sensorThreshold;
    final draft = RuleDraft(
      name: _nameController.text,
      triggerType: _type,
      actionDeviceId: _deviceId!,
      actionCommand: _action,
      triggerRoomId: isThreshold ? _roomId : null,
      triggerMetric: isThreshold ? _metric : null,
      triggerOperator: isThreshold ? _operator : null,
      triggerThreshold: isThreshold
          ? double.parse(_thresholdController.text.trim().replaceAll(',', '.'))
          : null,
      scheduleTime: isThreshold ? null : _timeText,
      scheduleDays: isThreshold ? null : (_days.toList()..sort()),
    );
    setState(() => _busy = true);
    final ok = await runAction(
      context,
      () => ref
          .read(automationRulesProvider(widget.homeId).notifier)
          .create(draft),
      errorContext: ErrorContext.automation,
      successMessage: 'Đã tạo quy tắc.',
    );
    if (!mounted) return;
    if (ok) {
      Navigator.of(context).pop();
    } else {
      setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final overview = ref.watch(homeOverviewProvider(widget.homeId)).value;
    final rooms = [
      for (final room in overview?.rooms ?? const [])
        if (overview!.devices.any((d) => d.roomId == room.id && d.isSensor))
          room,
    ];
    final relays = overview?.relays ?? const <CustomerDevice>[];

    return Scaffold(
      appBar: AppBar(title: const Text('Tạo quy tắc')),
      body: SafeArea(
        child: Form(
          key: _formKey,
          child: ListView(
            padding: const EdgeInsets.fromLTRB(20, 4, 20, 28),
            children: [
              TextFormField(
                controller: _nameController,
                maxLength: 128,
                decoration: const InputDecoration(
                  labelText: 'Tên quy tắc',
                  hintText: 'VD: Phòng ngủ nóng → bật quạt',
                ),
                validator: (v) => (v == null || v.trim().isEmpty)
                    ? 'Vui lòng đặt tên cho quy tắc'
                    : null,
              ),
              const SizedBox(height: 8),
              const SectionHeader('Khi nào?'),
              Row(
                children: [
                  for (final type in TriggerType.values) ...[
                    ChoicePill(
                      label: type.label,
                      selected: _type == type,
                      onTap: () => setState(() => _type = type),
                    ),
                    const SizedBox(width: 8),
                  ],
                ],
              ),
              const SizedBox(height: 16),
              if (_type == TriggerType.sensorThreshold) ...[
                PickerField<int>(
                  label: 'Phòng có cảm biến',
                  icon: Icons.meeting_room_outlined,
                  value: _roomId,
                  options: [
                    for (final r in rooms)
                      PickerOption(value: r.id, label: r.name),
                  ],
                  onChanged: (v) => setState(() => _roomId = v),
                  validator: (v) => v == null ? 'Chọn phòng' : null,
                ),
                const SizedBox(height: 14),
                Wrap(
                  spacing: 8,
                  runSpacing: 8,
                  children: [
                    for (final m in TriggerMetric.values)
                      ChoicePill(
                        label: m.label,
                        selected: _metric == m,
                        onTap: () => setState(() => _metric = m),
                      ),
                  ],
                ),
                const SizedBox(height: 10),
                Wrap(
                  spacing: 8,
                  runSpacing: 8,
                  children: [
                    for (final o in TriggerOperator.values)
                      ChoicePill(
                        label: '${o.label} (${o.symbol})',
                        selected: _operator == o,
                        onTap: () => setState(() => _operator = o),
                      ),
                  ],
                ),
                const SizedBox(height: 14),
                TextFormField(
                  controller: _thresholdController,
                  keyboardType: const TextInputType.numberWithOptions(
                    decimal: true,
                    signed: true,
                  ),
                  decoration: InputDecoration(
                    labelText: 'Ngưỡng (${_metric.unit})',
                    hintText: _metric == TriggerMetric.temperature ? '30' : '70',
                  ),
                  validator: (v) =>
                      double.tryParse((v ?? '').trim().replaceAll(',', '.')) ==
                          null
                      ? 'Nhập một số, ví dụ 30'
                      : null,
                ),
              ] else ...[
                AppCard(
                  radius: 14,
                  padding: const EdgeInsets.symmetric(
                    horizontal: 16,
                    vertical: 12,
                  ),
                  color: AppColors.surfaceTint,
                  onTap: _pickTime,
                  child: Row(
                    children: [
                      const Icon(Icons.schedule, color: AppColors.primary),
                      const SizedBox(width: 12),
                      const Expanded(child: Text('Giờ chạy')),
                      Text(
                        _timeText,
                        style: const TextStyle(
                          fontSize: 20,
                          fontWeight: FontWeight.bold,
                        ),
                      ),
                    ],
                  ),
                ),
                const SizedBox(height: 14),
                Wrap(
                  spacing: 8,
                  runSpacing: 8,
                  children: [
                    for (var d = 1; d <= 7; d++)
                      ChoicePill(
                        label: shortWeekday(d),
                        selected: _days.contains(d),
                        onTap: () => setState(() {
                          _days.contains(d) ? _days.remove(d) : _days.add(d);
                        }),
                      ),
                  ],
                ),
                if (_daysError != null)
                  Padding(
                    padding: const EdgeInsets.only(top: 6),
                    child: Text(
                      _daysError!,
                      style: const TextStyle(
                        color: AppColors.critical,
                        fontSize: 12,
                      ),
                    ),
                  ),
              ],
              const SizedBox(height: 16),
              const SectionHeader('Thì làm gì?'),
              PickerField<int>(
                label: 'Thiết bị',
                icon: Icons.power_settings_new,
                value: _deviceId,
                options: [
                  for (final d in relays)
                    PickerOption(
                      value: d.id,
                      label: d.name,
                      subtitle: d.roomName,
                    ),
                ],
                onChanged: (v) => setState(() => _deviceId = v),
                validator: (v) => v == null ? 'Chọn thiết bị' : null,
              ),
              const SizedBox(height: 12),
              Row(
                children: [
                  for (final a in RuleAction.values) ...[
                    ChoicePill(
                      label: a.label,
                      selected: _action == a,
                      onTap: () => setState(() => _action = a),
                    ),
                    const SizedBox(width: 8),
                  ],
                ],
              ),
              const SizedBox(height: 28),
              FilledButton(
                onPressed: _busy ? null : _save,
                child: const Text('LƯU QUY TẮC'),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
