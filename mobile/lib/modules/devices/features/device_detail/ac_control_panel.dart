import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../../core/theme/app_theme.dart';
import '../../../../core/widgets/app_widgets.dart';
import '../../application/device_control_providers.dart';
import '../../application/device_providers.dart';
import '../../domain/ac_codes.dart';
import '../../domain/appliance.dart';
import '../../domain/device.dart';
import '../../ui/device_presentation.dart';

/// Detail controls of an air conditioner the backend has classified, like the
/// Node's touch screen: ON/OFF, the set point with − / +, the grid of 16 IR
/// codes (TẮT, 16 … 30 °C) and the "Học mã" mode that teaches the Node a code
/// from the real remote. Every command goes through the overview notifier; this
/// widget only shows state.
class AcControlPanel extends ConsumerStatefulWidget {
  const AcControlPanel({
    super.key,
    required this.device,
    this.homeSuspended = false,
  });

  final CustomerDevice device;
  final bool homeSuspended;

  @override
  ConsumerState<AcControlPanel> createState() => _AcControlPanelState();
}

class _AcControlPanelState extends ConsumerState<AcControlPanel> {
  bool _learnMode = false;

  @override
  Widget build(BuildContext context) {
    final device = widget.device;
    final draft = ref.watch(
      setpointDraftsProvider.select((drafts) => drafts[device.id]),
    );
    final sending = ref.watch(
      pendingCommandsProvider.select((ids) => ids.contains(device.id)),
    );
    final learn = ref.watch(acLearnProvider);

    final hint = deviceControlHint(device, homeSuspended: widget.homeSuspended);
    final learning = learn.isLearning;
    final adjusting = draft != null;
    // While one air-conditioner command is on its way (or the Node is
    // learning) the other controls wait.
    final canToggle = hint == null && !sending && !adjusting && !learning;
    final canAdjust = hint == null && !sending && !learning;
    final power = device.power;
    final setpoint = draft ?? device.acSetpoint;
    final learned = learnedCount(device.acCodes);
    final currentSlot = power == false
        ? AcSlot.off
        : (power == true && setpoint != null ? AcSlot.temp(setpoint) : null);
    final notice = learn.deviceId == device.id ? learn.notice : null;

    bool cellEnabled(AcSlot slot) {
      if (learning || hint != null) return false;
      if (_learnMode) return true;
      if (isSlotLearned(device.acCodes, slot) == false) return false;
      return slot.isOff ? canToggle : canAdjust;
    }

    void pressCell(AcSlot slot) {
      if (_learnMode) {
        learnAcCode(context, ref, device, slot);
      } else if (slot.isOff) {
        togglePower(context, ref, device, false);
      } else {
        setAcSetpoint(context, ref, device, slot.temperature!);
      }
    }

    return AppCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Row(
            children: [
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    const Text(
                      'Trạng thái điều hòa',
                      style: TextStyle(
                        fontSize: 12,
                        color: AppColors.textSecondary,
                      ),
                    ),
                    const SizedBox(height: 2),
                    Text(
                      power == null
                          ? 'Chưa rõ'
                          : (power ? 'Đang bật' : 'Đang tắt'),
                      key: const ValueKey<String>('ac-status'),
                      style: TextStyle(
                        fontSize: 16,
                        fontWeight: FontWeight.bold,
                        color: power == true
                            ? AppColors.success
                            : AppColors.textPrimary,
                      ),
                    ),
                    if (sending || adjusting)
                      const Text(
                        'Đang gửi lệnh…',
                        style: TextStyle(
                          fontSize: 12,
                          color: AppColors.textSecondary,
                        ),
                      ),
                  ],
                ),
              ),
              _PowerButton(
                key: const ValueKey<String>('ac-on'),
                label: 'BẬT',
                filled: true,
                onTap: canToggle && power != true
                    ? () => togglePower(context, ref, device, true)
                    : null,
              ),
              const SizedBox(width: 8),
              _PowerButton(
                key: const ValueKey<String>('ac-off'),
                label: 'TẮT',
                filled: false,
                onTap: canToggle && power != false
                    ? () => togglePower(context, ref, device, false)
                    : null,
              ),
            ],
          ),
          const SizedBox(height: 18),
          Row(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              _RoundButton(
                key: const ValueKey<String>('ac-panel-minus'),
                icon: Icons.remove,
                tooltip: 'Giảm 1°C',
                onTap:
                    canAdjust && (setpoint == null || setpoint > acSetpointMin)
                    ? () => adjustAcSetpoint(context, ref, device, -1)
                    : null,
              ),
              SizedBox(
                width: 140,
                child: Text(
                  setpoint == null ? '--°C' : '$setpoint°C',
                  key: const ValueKey<String>('ac-panel-setpoint'),
                  textAlign: TextAlign.center,
                  style: TextStyle(
                    fontSize: 44,
                    fontWeight: FontWeight.bold,
                    color: adjusting
                        ? AppColors.primary
                        : AppColors.textPrimary,
                  ),
                ),
              ),
              _RoundButton(
                key: const ValueKey<String>('ac-panel-plus'),
                icon: Icons.add,
                tooltip: 'Tăng 1°C',
                onTap:
                    canAdjust && (setpoint == null || setpoint < acSetpointMax)
                    ? () => adjustAcSetpoint(context, ref, device, 1)
                    : null,
              ),
            ],
          ),
          const SizedBox(height: 18),
          Row(
            children: [
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    const Text(
                      'Mã remote đã học',
                      style: TextStyle(
                        fontWeight: FontWeight.bold,
                        color: AppColors.textPrimary,
                      ),
                    ),
                    Text(
                      learned == null
                          ? 'Node chưa báo các mã đã học.'
                          : '$learned/${acSlots.length} mã đã học · ô xanh bấm được để phát mã',
                      key: const ValueKey<String>('ac-learned-count'),
                      style: const TextStyle(
                        fontSize: 12,
                        color: AppColors.textSecondary,
                      ),
                    ),
                  ],
                ),
              ),
              const SizedBox(width: 8),
              ChoicePill(
                key: const ValueKey<String>('ac-learn-mode'),
                label: _learnMode ? 'Xong học mã' : 'Học mã',
                icon: Icons.menu_book_outlined,
                selected: _learnMode,
                onTap: learning || hint != null
                    ? null
                    : () => setState(() => _learnMode = !_learnMode),
              ),
            ],
          ),
          const SizedBox(height: 10),
          GridView.count(
            crossAxisCount: 4,
            shrinkWrap: true,
            physics: const NeverScrollableScrollPhysics(),
            mainAxisSpacing: 8,
            crossAxisSpacing: 8,
            childAspectRatio: 1.35,
            children: [
              for (final slot in acSlots)
                _CodeCell(
                  key: ValueKey<String>('ac-slot-${slot.label}'),
                  slot: slot,
                  learned: isSlotLearned(device.acCodes, slot),
                  current: currentSlot == slot,
                  learnMode: _learnMode,
                  learningThis:
                      learn.isLearningDevice(device.id) && learn.slot == slot,
                  enabled: cellEnabled(slot),
                  onPress: () => pressCell(slot),
                ),
            ],
          ),
          const SizedBox(height: 12),
          if (learn.isLearningDevice(device.id))
            _LearningBanner(slot: learn.slot!, secondsLeft: learn.secondsLeft)
          else if (notice != null)
            _NoticeBanner(
              notice: notice,
              onDismiss: ref.read(acLearnProvider.notifier).dismissNotice,
            )
          else if (_learnMode)
            const InlineBanner(
              message:
                  'Chế độ học mã: chạm một ô để học mã đó. Sau khi chạm, bạn có '
                  '$learnWindowSeconds giây để bấm remote thật hướng vào Node. '
                  'Chạm ô đã học để học lại (ghi đè).',
            ),
          const SizedBox(height: 12),
          Text(
            '${hint ?? 'Đặt nhiệt độ hoặc chạm một ô mã khi điều hòa đang tắt sẽ bật điều hòa. '}'
            'Trạng thái hiển thị là lệnh Node đã phát. Điều khiển hồng ngoại chỉ '
            'có một chiều, nên nếu bạn dùng remote thật thì trạng thái trên đây '
            'có thể lệch với điều hòa.',
            style: const TextStyle(
              fontSize: 12,
              color: AppColors.textSecondary,
            ),
          ),
        ],
      ),
    );
  }
}

class _PowerButton extends StatelessWidget {
  const _PowerButton({
    super.key,
    required this.label,
    required this.filled,
    required this.onTap,
  });

  final String label;
  final bool filled;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    const padding = EdgeInsets.symmetric(horizontal: 14, vertical: 10);
    const size = Size(0, 40);
    final icon = const Icon(Icons.power_settings_new, size: 18);
    return filled
        ? FilledButton.icon(
            onPressed: onTap,
            icon: icon,
            label: Text(label),
            style: FilledButton.styleFrom(padding: padding, minimumSize: size),
          )
        : OutlinedButton.icon(
            onPressed: onTap,
            icon: icon,
            label: Text(label),
            style: OutlinedButton.styleFrom(
              padding: padding,
              minimumSize: size,
            ),
          );
  }
}

class _RoundButton extends StatelessWidget {
  const _RoundButton({
    super.key,
    required this.icon,
    required this.tooltip,
    required this.onTap,
  });

  final IconData icon;
  final String tooltip;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    final enabled = onTap != null;
    return Tooltip(
      message: tooltip,
      child: Material(
        color: AppColors.surfaceTint,
        shape: const CircleBorder(),
        child: InkWell(
          customBorder: const CircleBorder(),
          onTap: onTap,
          child: SizedBox(
            width: 52,
            height: 52,
            child: Icon(
              icon,
              color: enabled
                  ? AppColors.primary
                  : AppColors.primary.withValues(alpha: 0.3),
            ),
          ),
        ),
      ),
    );
  }
}

class _CodeCell extends StatelessWidget {
  const _CodeCell({
    super.key,
    required this.slot,
    required this.learned,
    required this.current,
    required this.learnMode,
    required this.learningThis,
    required this.enabled,
    required this.onPress,
  });

  final AcSlot slot;

  /// `null` = the Node has not reported the bitmask.
  final bool? learned;
  final bool current;
  final bool learnMode;
  final bool learningThis;
  final bool enabled;
  final VoidCallback onPress;

  @override
  Widget build(BuildContext context) {
    final Color background;
    final Color foreground;
    BorderSide border = BorderSide.none;
    if (learningThis) {
      background = AppColors.primary.withValues(alpha: 0.14);
      foreground = AppColors.primary;
      border = const BorderSide(color: AppColors.primary);
    } else if (learned == true) {
      background = AppColors.success.withValues(alpha: 0.12);
      foreground = AppColors.success;
    } else if (learned == false) {
      background = Colors.transparent;
      foreground = AppColors.textSecondary;
      border = const BorderSide(color: AppColors.track);
    } else {
      background = AppColors.surfaceTint;
      foreground = AppColors.textPrimary;
    }
    final label = slot.label;
    final semantics = learnMode
        ? 'Học mã $label${learned == true ? ' (đã học, học lại)' : ''}'
        : 'Phát mã $label${learned == false ? ' — chưa học' : ''}'
              '${current ? ' — đang đặt' : ''}';
    return Semantics(
      button: true,
      enabled: enabled,
      selected: current,
      label: semantics,
      excludeSemantics: true,
      child: Opacity(
        opacity: learned == false && !learnMode ? 0.7 : 1,
        child: Material(
          color: background,
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(12),
            side: current
                ? const BorderSide(color: AppColors.primary, width: 2)
                : border,
          ),
          child: InkWell(
            customBorder: RoundedRectangleBorder(
              borderRadius: BorderRadius.circular(12),
            ),
            onTap: enabled ? onPress : null,
            child: Stack(
              alignment: Alignment.center,
              children: [
                Column(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Text(
                      label,
                      style: TextStyle(
                        color: foreground,
                        fontWeight: FontWeight.bold,
                        fontSize: 13,
                      ),
                    ),
                    if (learned == false)
                      Text(
                        'Chưa học',
                        style: TextStyle(color: foreground, fontSize: 9.5),
                      ),
                  ],
                ),
                if (learned == true)
                  Positioned(
                    top: 4,
                    right: 5,
                    child: Icon(Icons.check, size: 12, color: foreground),
                  ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

class _LearningBanner extends StatelessWidget {
  const _LearningBanner({required this.slot, required this.secondsLeft});

  final AcSlot slot;
  final int secondsLeft;

  @override
  Widget build(BuildContext context) {
    return Container(
      key: const ValueKey<String>('ac-learning-banner'),
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: AppColors.primary.withValues(alpha: 0.10),
        borderRadius: BorderRadius.circular(16),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              const Icon(Icons.sensors, size: 18, color: AppColors.primary),
              const SizedBox(width: 8),
              Expanded(
                child: Text(
                  secondsLeft > 0
                      ? 'Đang học mã ${slot.label} — còn $secondsLeft giây'
                      : 'Đang học mã ${slot.label} — hết giờ, đang chờ Node trả lời…',
                  style: const TextStyle(
                    fontWeight: FontWeight.bold,
                    color: AppColors.primary,
                  ),
                ),
              ),
            ],
          ),
          const SizedBox(height: 6),
          Text(
            learnInstruction(slot),
            style: const TextStyle(
              fontSize: 13,
              height: 1.35,
              color: AppColors.textPrimary,
            ),
          ),
          const SizedBox(height: 10),
          ClipRRect(
            borderRadius: BorderRadius.circular(4),
            child: LinearProgressIndicator(
              value: secondsLeft / learnWindowSeconds,
              minHeight: 6,
              backgroundColor: AppColors.primary.withValues(alpha: 0.15),
            ),
          ),
        ],
      ),
    );
  }
}

class _NoticeBanner extends StatelessWidget {
  const _NoticeBanner({required this.notice, required this.onDismiss});

  final AcLearnNotice notice;
  final VoidCallback onDismiss;

  @override
  Widget build(BuildContext context) {
    return InlineBanner(
      key: const ValueKey<String>('ac-learn-notice'),
      kind: notice.success ? BannerKind.success : BannerKind.error,
      message: notice.text,
      action: TextButton(onPressed: onDismiss, child: const Text('Đóng')),
    );
  }
}
