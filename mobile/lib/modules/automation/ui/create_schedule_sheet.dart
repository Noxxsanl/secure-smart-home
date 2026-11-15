import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/network/error_messages.dart';
import '../../../core/theme/app_theme.dart';
import '../../../core/utils/date_format.dart';
import '../../../core/utils/home_time.dart';
import '../../../core/widgets/app_widgets.dart';
import '../../devices/devices.dart' show CustomerDevice;
import '../application/schedule_providers.dart';
import '../domain/schedule_input.dart';
import '../domain/schedule_text.dart';

/// Opens the "Thêm hẹn giờ" sheet. [devices] are the schedulable relays (see
/// [schedulableDevices]); [defaultDeviceId] preselects one (opened from the
/// device detail). Resolves to `true` once a schedule was created.
Future<bool> showCreateScheduleSheet(
  BuildContext context, {
  required int homeId,
  required String timezone,
  required List<CustomerDevice> devices,
  int? defaultDeviceId,
}) async {
  final created = await showModalBottomSheet<bool>(
    context: context,
    isScrollControlled: true,
    useSafeArea: true,
    backgroundColor: AppColors.background,
    shape: const RoundedRectangleBorder(
      borderRadius: BorderRadius.vertical(top: Radius.circular(24)),
    ),
    builder: (_) => CreateScheduleSheet(
      homeId: homeId,
      timezone: timezone,
      devices: devices,
      defaultDeviceId: defaultDeviceId,
    ),
  );
  return created ?? false;
}

/// Form of a one-off schedule (FR-5.10): device (grouped by room), operation by
/// appliance, then "Lúc HH:MM [ngày]" or "Sau N phút" with a preview of the run
/// time. Errors stay inside the sheet and keep what was typed.
class CreateScheduleSheet extends ConsumerStatefulWidget {
  const CreateScheduleSheet({
    super.key,
    required this.homeId,
    required this.timezone,
    required this.devices,
    this.defaultDeviceId,
  });

  final int homeId;

  /// IANA name of the home: the typed time is read on its clock.
  final String timezone;
  final List<CustomerDevice> devices;
  final int? defaultDeviceId;

  @override
  ConsumerState<CreateScheduleSheet> createState() =>
      _CreateScheduleSheetState();
}

class _CreateScheduleSheetState extends ConsumerState<CreateScheduleSheet> {
  late final HomeClock _clock = HomeClock(widget.timezone);
  late int? _deviceId = _initialDevice();
  String? _choiceKey;
  late WhenDraft _draft = WhenDraft(
    time: defaultScheduleTime(_clock, DateTime.now()),
  );
  final _temperature = TextEditingController(text: '$scheduleTempDefault');
  final _minutes = TextEditingController(text: '30');
  String? _error;
  bool _submitting = false;

  int? _initialDevice() {
    for (final device in widget.devices) {
      if (device.id == widget.defaultDeviceId) return device.id;
    }
    return widget.devices.isEmpty ? null : widget.devices.first.id;
  }

  @override
  void dispose() {
    _temperature.dispose();
    _minutes.dispose();
    super.dispose();
  }

  CustomerDevice? get _device {
    for (final device in widget.devices) {
      if (device.id == _deviceId) return device;
    }
    return null;
  }

  List<ScheduleChoice> get _choices => scheduleChoicesFor(_device?.appliance);

  ScheduleChoice? get _choice {
    final choices = _choices;
    for (final choice in choices) {
      if (choice.key == _choiceKey) return choice;
    }
    return choices.isEmpty ? null : choices.first;
  }

  void _update(WhenDraft draft) => setState(() {
    _draft = draft;
    _error = null;
  });

  Future<void> _pickTime() async {
    final parts = _draft.time.split(':');
    final picked = await showTimePicker(
      context: context,
      initialTime: parts.length == 2
          ? TimeOfDay(
              hour: int.tryParse(parts[0]) ?? 0,
              minute: int.tryParse(parts[1]) ?? 0,
            )
          : TimeOfDay.now(),
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
    if (picked == null || !mounted) return;
    _update(
      _draft.copyWith(
        time: '${twoDigits(picked.hour)}:${twoDigits(picked.minute)}',
      ),
    );
  }

  DateTime _dateOfKey(String key) {
    final parts = key.split('-').map(int.parse).toList(growable: false);
    return DateTime(parts[0], parts[1], parts[2]);
  }

  Future<void> _pickDate() async {
    final today = _clock.todayKey(DateTime.now());
    final picked = await showDatePicker(
      context: context,
      initialDate: _dateOfKey(
        isValidScheduleDate(_draft.pickedDate) ? _draft.pickedDate : today,
      ),
      firstDate: _dateOfKey(today),
      lastDate: _dateOfKey(addDaysToKey(today, 7)),
      helpText: 'Chọn ngày chạy',
      cancelText: 'Huỷ',
      confirmText: 'Chọn',
    );
    if (picked == null || !mounted) return;
    _update(
      _draft.copyWith(
        pickedDate:
            '${picked.year.toString().padLeft(4, '0')}-'
            '${twoDigits(picked.month)}-${twoDigits(picked.day)}',
      ),
    );
  }

  Future<void> _submit() async {
    final device = _device;
    final choice = _choice;
    if (device == null || choice == null) {
      setState(() => _error = 'Hãy chọn thiết bị cần hẹn giờ.');
      return;
    }
    int? temperature;
    if (choice.needsTemperature) {
      temperature = parseScheduleTemperature(_temperature.text);
      if (temperature == null) {
        setState(
          () => _error =
              'Nhiệt độ điều hoà cần là số nguyên từ $scheduleTempMin đến '
              '$scheduleTempMax °C.',
        );
        return;
      }
    }
    final when = buildWhen(_draft, _clock, DateTime.now());
    if (when == null) {
      setState(() {
        _error = _draft.mode == WhenMode.after
            ? 'Hãy nhập số phút từ $scheduleAfterMin đến $scheduleAfterMax '
                  '(tối đa 7 ngày).'
            : _draft.dateChoice == DateChoice.pick &&
                  !isValidScheduleDate(_draft.pickedDate)
            ? 'Hãy chọn ngày chạy.'
            : 'Hãy chọn giờ chạy theo dạng HH:MM, VD 20:00.';
      });
      return;
    }
    final input = ScheduleInput(
      deviceId: device.id,
      action: choice.action,
      temperature: temperature,
      // Position 0 (closed) must still be sent.
      position: choice.position,
      when: when,
    );
    setState(() {
      _submitting = true;
      _error = null;
    });
    try {
      await ref.read(scheduleActionsProvider).create(widget.homeId, input);
      if (mounted) Navigator.of(context).pop(true);
    } on Object catch (error) {
      if (!mounted) return;
      setState(() {
        _error = userMessageFor(error, overrides: scheduleErrors);
        _submitting = false;
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    final bottomInset = MediaQuery.viewInsetsOf(context).bottom;
    return Padding(
      padding: EdgeInsets.only(bottom: bottomInset),
      child: SingleChildScrollView(
        padding: const EdgeInsets.fromLTRB(20, 20, 20, 20),
        child: widget.devices.isEmpty ? _buildEmpty(context) : _buildForm(),
      ),
    );
  }

  Widget _buildEmpty(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        const _SheetTitle(),
        const SizedBox(height: 12),
        const Text(
          noSchedulableDeviceMessage,
          style: TextStyle(color: AppColors.textSecondary, height: 1.4),
        ),
        const SizedBox(height: 16),
        Align(
          alignment: Alignment.centerRight,
          child: TextButton(
            onPressed: () => Navigator.of(context).pop(false),
            child: const Text('Đóng'),
          ),
        ),
      ],
    );
  }

  Widget _buildForm() {
    final choice = _choice;
    final now = DateTime.now();
    final when = buildWhen(_draft, _clock, now);
    final preview = previewWhen(when, _clock, now);
    final today = _clock.todayKey(now);

    // Group by room so a long list stays easy to pick from.
    final groups = <String, List<CustomerDevice>>{};
    for (final device in widget.devices) {
      groups
          .putIfAbsent(device.roomName ?? 'Chưa gán phòng', () => [])
          .add(device);
    }

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        const _SheetTitle(),
        const SizedBox(height: 16),
        const _Label('Thiết bị'),
        for (final entry in groups.entries) ...[
          Padding(
            padding: const EdgeInsets.only(top: 4, bottom: 6),
            child: Text(
              entry.key,
              style: const TextStyle(
                fontSize: 12,
                color: AppColors.textSecondary,
              ),
            ),
          ),
          for (final device in entry.value)
            _DeviceOption(
              key: ValueKey<String>('schedule-device-${device.id}'),
              device: device,
              selected: device.id == _deviceId,
              onTap: _submitting
                  ? null
                  : () => setState(() {
                      _deviceId = device.id;
                      _choiceKey = null;
                      _error = null;
                    }),
            ),
        ],
        const SizedBox(height: 16),
        const _Label('Thao tác'),
        Wrap(
          spacing: 8,
          runSpacing: 8,
          children: [
            for (final c in _choices)
              ChoicePill(
                key: ValueKey<String>('schedule-choice-${c.key}'),
                label: c.label,
                selected: c.key == choice?.key,
                onTap: _submitting
                    ? null
                    : () => setState(() {
                        _choiceKey = c.key;
                        _error = null;
                      }),
              ),
          ],
        ),
        if (choice?.needsTemperature ?? false) ...[
          const SizedBox(height: 10),
          TextField(
            key: const ValueKey<String>('schedule-temperature'),
            controller: _temperature,
            enabled: !_submitting,
            keyboardType: TextInputType.number,
            onChanged: (_) => setState(() => _error = null),
            decoration: const InputDecoration(
              labelText: 'Nhiệt độ đặt (°C)',
              suffixText: '°C',
              helperText: 'Từ $scheduleTempMin đến $scheduleTempMax °C',
            ),
          ),
        ],
        const SizedBox(height: 16),
        const _Label('Thời điểm'),
        Row(
          children: [
            ChoicePill(
              key: const ValueKey<String>('schedule-mode-at'),
              label: 'Lúc',
              selected: _draft.mode == WhenMode.at,
              onTap: _submitting
                  ? null
                  : () => _update(_draft.copyWith(mode: WhenMode.at)),
            ),
            const SizedBox(width: 8),
            ChoicePill(
              key: const ValueKey<String>('schedule-mode-after'),
              label: 'Sau',
              selected: _draft.mode == WhenMode.after,
              onTap: _submitting
                  ? null
                  : () => _update(_draft.copyWith(mode: WhenMode.after)),
            ),
          ],
        ),
        const SizedBox(height: 10),
        if (_draft.mode == WhenMode.at) ...[
          OutlinedButton.icon(
            key: const ValueKey<String>('schedule-time'),
            onPressed: _submitting ? null : _pickTime,
            icon: const Icon(Icons.schedule),
            label: Text(
              _draft.time.isEmpty ? 'Chọn giờ' : 'Giờ chạy: ${_draft.time}',
            ),
          ),
          const SizedBox(height: 10),
          Wrap(
            spacing: 8,
            runSpacing: 8,
            children: [
              for (final dateChoice in DateChoice.values)
                ChoicePill(
                  key: ValueKey<String>('schedule-date-${dateChoice.name}'),
                  label: dateChoice.label,
                  selected: _draft.dateChoice == dateChoice,
                  onTap: _submitting
                      ? null
                      : () => _update(_draft.copyWith(dateChoice: dateChoice)),
                ),
            ],
          ),
          if (_draft.dateChoice == DateChoice.pick) ...[
            const SizedBox(height: 10),
            OutlinedButton.icon(
              key: const ValueKey<String>('schedule-date-picker'),
              onPressed: _submitting ? null : _pickDate,
              icon: const Icon(Icons.calendar_today_outlined),
              label: Text(
                isValidScheduleDate(_draft.pickedDate)
                    ? 'Ngày ${dayLabel(_draft.pickedDate, today)} '
                          '(${_draft.pickedDate})'
                    : 'Chọn ngày chạy',
              ),
            ),
          ],
          const SizedBox(height: 8),
          Text(
            '“Lần tới” chạy hôm nay nếu giờ đó chưa qua, nếu không thì ngày '
            'mai. Giờ tính theo múi giờ của nhà (${_clock.timezone})'
            '${_clock.isExact ? '' : ', hiển thị theo giờ điện thoại'}.',
            style: const TextStyle(
              fontSize: 11,
              color: AppColors.textSecondary,
              height: 1.3,
            ),
          ),
        ] else ...[
          Wrap(
            spacing: 8,
            runSpacing: 8,
            children: [
              for (final m in scheduleAfterPresets)
                ChoicePill(
                  key: ValueKey<String>('schedule-after-$m'),
                  label: '$m phút',
                  selected: _draft.afterMinutes == '$m',
                  onTap: _submitting
                      ? null
                      : () {
                          _minutes.text = '$m';
                          _update(_draft.copyWith(afterMinutes: '$m'));
                        },
                ),
            ],
          ),
          const SizedBox(height: 10),
          TextField(
            key: const ValueKey<String>('schedule-minutes'),
            controller: _minutes,
            enabled: !_submitting,
            keyboardType: TextInputType.number,
            onChanged: (value) => _update(_draft.copyWith(afterMinutes: value)),
            decoration: const InputDecoration(
              labelText: 'Hoặc nhập số phút',
              suffixText: 'phút',
              helperText: 'Tối đa 7 ngày = $scheduleAfterMax phút',
            ),
          ),
        ],
        const SizedBox(height: 14),
        Container(
          key: const ValueKey<String>('schedule-preview'),
          padding: const EdgeInsets.all(12),
          decoration: BoxDecoration(
            color: AppColors.surfaceTint,
            borderRadius: BorderRadius.circular(14),
          ),
          child: Text(
            preview == null
                ? 'Chọn thời điểm để xem giờ chạy dự kiến.'
                : 'Sẽ chạy: $preview',
            style: const TextStyle(
              fontWeight: FontWeight.w600,
              color: AppColors.textPrimary,
            ),
          ),
        ),
        if (_error != null) ...[
          const SizedBox(height: 12),
          InlineBanner(
            key: const ValueKey<String>('schedule-error'),
            kind: BannerKind.error,
            message: _error!,
          ),
        ],
        const SizedBox(height: 16),
        Row(
          children: [
            Expanded(
              child: OutlinedButton(
                onPressed: _submitting
                    ? null
                    : () => Navigator.of(context).pop(false),
                child: const Text('Huỷ'),
              ),
            ),
            const SizedBox(width: 12),
            Expanded(
              child: FilledButton(
                key: const ValueKey<String>('schedule-save'),
                onPressed: _submitting ? null : _submit,
                child: Text(_submitting ? 'Đang lưu…' : 'Lưu hẹn giờ'),
              ),
            ),
          ],
        ),
      ],
    );
  }
}

/// One selectable device row: full width so long names wrap instead of
/// overflowing a narrow phone.
class _DeviceOption extends StatelessWidget {
  const _DeviceOption({
    super.key,
    required this.device,
    required this.selected,
    required this.onTap,
  });

  final CustomerDevice device;
  final bool selected;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    return Semantics(
      selected: selected,
      button: true,
      child: Padding(
        padding: const EdgeInsets.only(bottom: 6),
        child: Material(
          color: selected ? AppColors.surfaceTint : AppColors.surface,
          borderRadius: BorderRadius.circular(12),
          child: InkWell(
            borderRadius: BorderRadius.circular(12),
            onTap: onTap,
            child: Container(
              padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
              decoration: BoxDecoration(
                borderRadius: BorderRadius.circular(12),
                border: Border.all(
                  color: selected ? AppColors.primary : AppColors.track,
                  width: selected ? 1.5 : 1,
                ),
              ),
              child: Row(
                children: [
                  Icon(
                    selected
                        ? Icons.radio_button_checked
                        : Icons.radio_button_unchecked,
                    size: 20,
                    color: selected ? AppColors.primary : AppColors.offline,
                  ),
                  const SizedBox(width: 10),
                  Expanded(
                    child: Text(
                      device.name,
                      style: const TextStyle(
                        fontWeight: FontWeight.w600,
                        color: AppColors.textPrimary,
                      ),
                    ),
                  ),
                  const SizedBox(width: 8),
                  Text(
                    device.appliance?.label ?? 'Thiết bị',
                    style: const TextStyle(
                      fontSize: 12,
                      color: AppColors.textSecondary,
                    ),
                  ),
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }
}

class _SheetTitle extends StatelessWidget {
  const _SheetTitle();

  @override
  Widget build(BuildContext context) => const Text(
    'Thêm hẹn giờ',
    style: TextStyle(fontSize: 18, fontWeight: FontWeight.bold),
  );
}

class _Label extends StatelessWidget {
  const _Label(this.text);

  final String text;

  @override
  Widget build(BuildContext context) => Text(
    text.toUpperCase(),
    style: const TextStyle(
      fontSize: 11,
      fontWeight: FontWeight.bold,
      letterSpacing: 0.6,
      color: AppColors.textSecondary,
    ),
  );
}
