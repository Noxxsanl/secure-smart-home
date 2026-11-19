import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/network/error_messages.dart';
import '../../../core/utils/date_format.dart';
import '../../../core/widgets/app_feedback.dart';
import '../../homes/homes.dart';
import '../domain/ac_codes.dart';
import '../domain/appliance.dart';
import '../domain/curtain.dart';
import '../domain/device.dart';
import '../domain/device_errors.dart';

/// Icon for a device: lights, fans, curtains, air conditioners, sensors, door
/// contacts, cameras.
IconData deviceIcon(CustomerDevice device) {
  switch (device.category) {
    case DeviceCategory.relay:
      return switch (ApplianceKind.of(device)) {
        ApplianceKind.lamp => Icons.lightbulb_outline,
        ApplianceKind.fan => Icons.air,
        ApplianceKind.curtain => Icons.curtains_outlined,
        ApplianceKind.airConditioner => Icons.ac_unit,
        _ => Icons.power_settings_new,
      };
    case DeviceCategory.sensor:
      return Icons.thermostat_outlined;
    case DeviceCategory.doorContact:
      return Icons.sensor_door_outlined;
    case DeviceCategory.camera:
      return Icons.videocam_outlined;
    case DeviceCategory.gateway:
      return Icons.router_outlined;
  }
}

String deviceCategoryLabel(DeviceCategory category) => switch (category) {
  DeviceCategory.relay => 'Thiết bị bật/tắt',
  DeviceCategory.sensor => 'Cảm biến nhiệt/ẩm',
  DeviceCategory.doorContact => 'Cảm biến cửa',
  DeviceCategory.camera => 'Camera',
  DeviceCategory.gateway => 'Gateway',
};

/// Device type for the detail page: the appliance for relays, else the
/// category.
String deviceTypeLabel(CustomerDevice device) =>
    ApplianceKind.of(device)?.label ?? deviceCategoryLabel(device.category);

/// One-line state shown on tiles and rows.
String deviceSubtitle(CustomerDevice device) {
  switch (device.category) {
    case DeviceCategory.relay:
      if (!device.online) return 'Ngoại tuyến';
      final kind = ApplianceKind.of(device) ?? ApplianceKind.plainSwitch;
      if (kind == ApplianceKind.curtain) {
        return curtainStatusText(device.curtainPos, device.power);
      }
      return kind.stateOf(device.isOn);
    case DeviceCategory.sensor:
      final reading = device.latest;
      if (reading == null || !reading.hasClimate) {
        return device.online ? 'Chưa có số liệu' : 'Ngoại tuyến';
      }
      return '${formatTemperature(reading.temperature)} · '
          '${formatHumidity(reading.humidity)}';
    case DeviceCategory.doorContact:
      final open = device.latest?.doorOpen;
      if (open == null) {
        return device.online ? 'Chưa có số liệu' : 'Ngoại tuyến';
      }
      return open ? 'Đang mở' : 'Đang đóng';
    case DeviceCategory.camera:
      return device.online ? 'Xem trực tiếp · ảnh chụp' : 'Ngoại tuyến';
    case DeviceCategory.gateway:
      return device.online ? 'Online' : 'Ngoại tuyến';
  }
}

/// Why the relay switch is disabled, or `null` when it can be used (FR-5.5).
String? deviceControlHint(CustomerDevice device, {bool homeSuspended = false}) {
  if (!device.isRelay) return null;
  if (device.isBlocked) {
    return 'Thiết bị đã bị khoá vì lý do bảo mật. Vui lòng liên hệ bộ phận hỗ trợ.';
  }
  if (!device.canControl) {
    return 'Bạn không có quyền điều khiển thiết bị này. Liên hệ chủ nhà để được cấp quyền.';
  }
  if (homeSuspended) {
    return 'Nhà đang tạm ngưng dịch vụ nên chưa điều khiển được. Vui lòng liên hệ bộ phận hỗ trợ.';
  }
  if (!device.online) {
    return 'Thiết bị đang ngoại tuyến. ${formatLastOnline(device.lastSeen)}.';
  }
  return null;
}

/// Runs a device command; on failure shows the Vietnamese guidance for the
/// error (never the raw code). [overrides] are the module's own sentences for
/// the command (`deviceCommandMessages`, `acSetpointMessages`…).
Future<bool> runDeviceAction(
  BuildContext context,
  Future<void> Function() action, {
  Map<String, String> overrides = deviceCommandMessages,
}) async {
  final messenger = ScaffoldMessenger.maybeOf(context);
  try {
    await action();
    return true;
  } on Object catch (error) {
    showAppSnack(
      messenger,
      userMessageFor(
        error,
        context: ErrorContext.deviceCommand,
        overrides: overrides,
      ),
      error: true,
    );
    return false;
  }
}

HomeOverviewNotifier _overviewOf(WidgetRef ref, CustomerDevice device) =>
    ref.read(homeOverviewProvider(device.homeId).notifier);

/// Switches a relay (optimistic with rollback, FR-5.3) and reports failures
/// with Vietnamese guidance.
Future<bool> togglePower(
  BuildContext context,
  WidgetRef ref,
  CustomerDevice device,
  bool on,
) => runDeviceAction(
  context,
  () => _overviewOf(ref, device).setPower(device.id, on),
);

/// Curtain level (`set_pos` 0 / 50 / 100): optimistic, rolled back on failure.
Future<bool> setCurtainLevel(
  BuildContext context,
  WidgetRef ref,
  CustomerDevice device,
  int position,
) => runDeviceAction(
  context,
  () => _overviewOf(ref, device).setCurtainPosition(device.id, position),
);

/// −/+ of an air conditioner; quick taps are merged into one `set_temp`.
Future<bool> adjustAcSetpoint(
  BuildContext context,
  WidgetRef ref,
  CustomerDevice device,
  int delta,
) => runDeviceAction(
  context,
  () => _overviewOf(ref, device).adjustSetpoint(device.id, delta),
  overrides: acSetpointMessages,
);

/// Sets the air-conditioner set point directly (a cell of the code grid).
Future<bool> setAcSetpoint(
  BuildContext context,
  WidgetRef ref,
  CustomerDevice device,
  int temperature,
) => runDeviceAction(
  context,
  () => _overviewOf(ref, device).setSetpoint(device.id, temperature),
  overrides: acSetpointMessages,
);

/// Teaches the Node one IR code; the outcome is also shown as a snack bar
/// (the panel keeps it as a notice too).
Future<void> learnAcCode(
  BuildContext context,
  WidgetRef ref,
  CustomerDevice device,
  AcSlot slot,
) async {
  final messenger = ScaffoldMessenger.maybeOf(context);
  final notice = await _overviewOf(ref, device).learnCode(device.id, slot);
  if (notice == null) return;
  showAppSnack(messenger, notice.text, error: !notice.success);
}
