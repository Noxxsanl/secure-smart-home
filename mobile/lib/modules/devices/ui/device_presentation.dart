import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/network/error_messages.dart';
import '../../../core/utils/date_format.dart';
import '../../../core/widgets/app_feedback.dart';
import '../../homes/homes.dart';
import '../domain/device.dart';

/// Icon for a device: lights, fans, sensors, door contacts, cameras.
IconData deviceIcon(CustomerDevice device) {
  switch (device.category) {
    case DeviceCategory.relay:
      final name = device.name.toLowerCase();
      if (name.contains('quạt')) return Icons.air;
      if (name.contains('đèn')) return Icons.lightbulb_outline;
      return Icons.power_settings_new;
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

/// One-line state shown on tiles and rows.
String deviceSubtitle(CustomerDevice device) {
  switch (device.category) {
    case DeviceCategory.relay:
      if (!device.online) return 'Ngoại tuyến';
      return device.isOn ? 'Đang bật' : 'Đang tắt';
    case DeviceCategory.sensor:
      final reading = device.latest;
      if (reading == null || !reading.hasClimate) {
        return device.online ? 'Chưa có số liệu' : 'Ngoại tuyến';
      }
      return '${formatTemperature(reading.temperature)} · '
          '${formatHumidity(reading.humidity)}';
    case DeviceCategory.doorContact:
      final open = device.latest?.doorOpen;
      if (open == null) return device.online ? 'Chưa có số liệu' : 'Ngoại tuyến';
      return open ? 'Đang mở' : 'Đang đóng';
    case DeviceCategory.camera:
      return 'Chưa hỗ trợ xem trực tiếp';
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

/// Switches a relay (optimistic with rollback, FR-5.3) and reports failures
/// with Vietnamese guidance.
Future<bool> togglePower(
  BuildContext context,
  WidgetRef ref,
  CustomerDevice device,
  bool on,
) {
  return runAction(
    context,
    () => ref
        .read(homeOverviewProvider(device.homeId).notifier)
        .setPower(device.id, on),
    errorContext: ErrorContext.deviceCommand,
  );
}
