import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../../core/network/error_messages.dart';
import '../../../../core/theme/app_theme.dart';
import '../../../../core/utils/date_format.dart';
import '../../../../core/widgets/app_feedback.dart';
import '../../../../core/widgets/app_widgets.dart';
import '../../../../core/widgets/async_views.dart';
import '../../../automation/automation.dart';
import '../../../homes/homes.dart';
import '../../application/device_providers.dart';
import '../../domain/device.dart';
import '../../ui/device_presentation.dart';
import 'camera_live_view.dart';
import 'camera_snapshots_section.dart';
import 'relay_control.dart';
import 'telemetry_chart.dart';

/// Device detail (FR-5.3 – 5.5): relay control by appliance (switch; curtain
/// Đóng/50%/100%; air conditioner with set point and IR codes — optimistic,
/// rolls back; see `relay_control.dart`),
/// sensor values + 24 h / 7 d chart, door state, camera live view + pictures,
/// rename.
class DeviceDetailPage extends ConsumerStatefulWidget {
  const DeviceDetailPage({
    super.key,
    required this.homeId,
    required this.deviceId,
    this.autoStartLive = false,
  });

  final int homeId;
  final int deviceId;

  /// Camera only: start the live stream as soon as the page opens ("Xem trực
  /// tiếp" on the Home screen).
  final bool autoStartLive;

  @override
  ConsumerState<DeviceDetailPage> createState() => _DeviceDetailPageState();
}

class _DeviceDetailPageState extends ConsumerState<DeviceDetailPage> {
  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (!mounted) return;
      unawaited(
        ref
            .read(homeOverviewProvider(widget.homeId).notifier)
            .refreshDevice(widget.deviceId),
      );
    });
  }

  Future<void> _rename(CustomerDevice device) async {
    final name = await promptText(
      context,
      title: 'Đổi tên thiết bị',
      label: 'Tên thiết bị',
      initial: device.name,
    );
    if (name == null || name == device.name || !mounted) return;
    await runAction(
      context,
      () => ref
          .read(homeOverviewProvider(widget.homeId).notifier)
          .renameDevice(device.id, name),
      successMessage: 'Đã đổi tên thiết bị.',
    );
  }

  Future<void> _refresh() async {
    final messenger = ScaffoldMessenger.maybeOf(context);
    try {
      await ref
          .read(homeOverviewProvider(widget.homeId).notifier)
          .refresh(throwOnError: true);
      final isCamera =
          ref
              .read(homeOverviewProvider(widget.homeId))
              .value
              ?.deviceById(widget.deviceId)
              ?.isCamera ??
          false;
      if (isCamera) {
        ref.invalidate(cameraSnapshotsProvider(widget.deviceId));
        await ref.read(cameraSnapshotsProvider(widget.deviceId).future);
      }
    } on Object catch (error) {
      showAppSnack(messenger, userMessageFor(error), error: true);
    }
  }

  @override
  Widget build(BuildContext context) {
    final overview = ref.watch(homeOverviewProvider(widget.homeId));
    final device = overview.value?.deviceById(widget.deviceId);
    final canRename = overview.value?.role.canRename ?? false;

    return Scaffold(
      appBar: AppBar(
        title: Text(device?.name ?? 'Thiết bị'),
        actions: [
          if (device != null && canRename)
            IconButton(
              tooltip: 'Đổi tên thiết bị',
              icon: const Icon(Icons.edit_outlined),
              onPressed: () => _rename(device),
            ),
        ],
      ),
      body: AsyncValueView<HomeOverview>(
        value: overview,
        onRetry: () => ref.invalidate(homeOverviewProvider(widget.homeId)),
        builder: (data) {
          final current = data.deviceById(widget.deviceId);
          if (current == null) {
            return const EmptyState(
              icon: Icons.devices_other_outlined,
              title: 'Thiết bị không còn trong nhà',
              message:
                  'Thiết bị có thể đã bị gỡ hoặc bạn không còn quyền truy cập. Quay lại và kéo xuống để tải lại.',
            );
          }
          return RefreshIndicator(
            onRefresh: _refresh,
            child: ListView(
              physics: const AlwaysScrollableScrollPhysics(),
              padding: const EdgeInsets.fromLTRB(20, 8, 20, 28),
              children: [
                _Header(device: current),
                const SizedBox(height: 20),
                if (current.isRelay)
                  RelayControl(device: current, home: data)
                else if (current.isSensor)
                  _SensorBody(device: current)
                else if (current.isDoorContact)
                  _DoorBody(device: current)
                else if (current.isCamera) ...[
                  CameraLiveView(
                    device: current,
                    autoStart: widget.autoStartLive,
                  ),
                  const SizedBox(height: 20),
                  CameraSnapshotsSection(deviceId: current.id),
                ],
                if (current.isSchedulable) ...[
                  const SizedBox(height: 20),
                  DeviceScheduleSection(homeId: widget.homeId, device: current),
                ],
                const SizedBox(height: 20),
                _InfoCard(device: current),
              ],
            ),
          );
        },
      ),
    );
  }
}

class _Header extends StatelessWidget {
  const _Header({required this.device});

  final CustomerDevice device;

  @override
  Widget build(BuildContext context) {
    final active = device.isRelay && device.isOn;
    return Column(
      children: [
        Container(
          width: 112,
          height: 112,
          decoration: BoxDecoration(
            color: active ? AppColors.primary : AppColors.surfaceTint,
            shape: BoxShape.circle,
          ),
          child: Icon(
            deviceIcon(device),
            size: 52,
            color: active ? Colors.white : AppColors.primary,
          ),
        ),
        const SizedBox(height: 14),
        Text(
          device.name,
          textAlign: TextAlign.center,
          style: const TextStyle(fontSize: 20, fontWeight: FontWeight.bold),
        ),
        if (device.roomName != null)
          Padding(
            padding: const EdgeInsets.only(top: 2),
            child: Text(
              device.roomName!,
              style: const TextStyle(color: AppColors.textSecondary),
            ),
          ),
        const SizedBox(height: 10),
        Wrap(
          spacing: 8,
          runSpacing: 6,
          alignment: WrapAlignment.center,
          children: [
            StatusPill(
              device.online ? 'Online' : 'Ngoại tuyến',
              color: device.online ? AppColors.success : AppColors.offline,
            ),
            StatusPill(deviceTypeLabel(device)),
            if (device.isBlocked)
              const StatusPill('Đã bị khoá', color: AppColors.critical),
          ],
        ),
      ],
    );
  }
}

class _SensorBody extends StatelessWidget {
  const _SensorBody({required this.device});

  final CustomerDevice device;

  @override
  Widget build(BuildContext context) {
    final reading = device.latest;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Row(
          children: [
            Expanded(
              child: _ValueCard(
                icon: Icons.thermostat_outlined,
                label: 'Nhiệt độ',
                value: formatTemperature(reading?.temperature),
              ),
            ),
            const SizedBox(width: 12),
            Expanded(
              child: _ValueCard(
                icon: Icons.water_drop_outlined,
                label: 'Độ ẩm',
                value: formatHumidity(reading?.humidity),
              ),
            ),
          ],
        ),
        if (reading?.receivedAt != null) ...[
          const SizedBox(height: 6),
          Center(
            child: Text(
              'Cập nhật ${formatRelative(reading!.receivedAt!)}',
              style: const TextStyle(
                fontSize: 11,
                color: AppColors.textSecondary,
              ),
            ),
          ),
        ],
        if (!device.online) ...[
          const SizedBox(height: 12),
          InlineBanner(
            kind: BannerKind.warning,
            message:
                'Cảm biến đang ngoại tuyến nên số liệu có thể đã cũ. ${formatLastOnline(device.lastSeen)}.',
          ),
        ],
        const SizedBox(height: 20),
        _TelemetrySection(deviceId: device.id),
      ],
    );
  }
}

class _ValueCard extends StatelessWidget {
  const _ValueCard({
    required this.icon,
    required this.label,
    required this.value,
  });

  final IconData icon;
  final String label;
  final String value;

  @override
  Widget build(BuildContext context) {
    return AppCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Icon(icon, color: AppColors.primary),
          const SizedBox(height: 10),
          Text(
            value,
            style: const TextStyle(
              fontSize: 24,
              fontWeight: FontWeight.bold,
              color: AppColors.textPrimary,
            ),
          ),
          Text(
            label,
            style: const TextStyle(
              color: AppColors.textSecondary,
              fontSize: 12,
            ),
          ),
        ],
      ),
    );
  }
}

class _TelemetrySection extends ConsumerStatefulWidget {
  const _TelemetrySection({required this.deviceId});

  final int deviceId;

  @override
  ConsumerState<_TelemetrySection> createState() => _TelemetrySectionState();
}

class _TelemetrySectionState extends ConsumerState<_TelemetrySection> {
  TelemetryRange _range = TelemetryRange.last24Hours;

  @override
  Widget build(BuildContext context) {
    final series = ref.watch(
      telemetryProvider((deviceId: widget.deviceId, range: _range)),
    );
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        SectionHeader(
          'Biểu đồ',
          trailing: Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              for (final range in TelemetryRange.values) ...[
                ChoicePill(
                  label: range.label,
                  selected: _range == range,
                  onTap: () => setState(() => _range = range),
                ),
                if (range != TelemetryRange.values.last)
                  const SizedBox(width: 8),
              ],
            ],
          ),
        ),
        series.when(
          loading: () => const SizedBox(
            height: 180,
            child: Center(child: CircularProgressIndicator()),
          ),
          error: (error, _) => ErrorView(
            message: userMessageFor(error),
            onRetry: () => ref.invalidate(
              telemetryProvider((deviceId: widget.deviceId, range: _range)),
            ),
          ),
          data: (data) {
            if (data.isEmpty) {
              return const InlineBanner(
                message:
                    'Chưa có số liệu trong khoảng thời gian này. Số liệu sẽ xuất hiện khi cảm biến gửi dữ liệu.',
              );
            }
            final times = [for (final p in data.points) p.time];
            return Column(
              children: [
                TelemetryChart(
                  title: 'Nhiệt độ (°C)',
                  unit: '°',
                  color: AppColors.critical,
                  times: times,
                  values: [for (final p in data.points) p.temperature],
                  range: _range,
                ),
                const SizedBox(height: 12),
                TelemetryChart(
                  title: 'Độ ẩm (%)',
                  unit: '%',
                  color: AppColors.primary,
                  times: times,
                  values: [for (final p in data.points) p.humidity],
                  range: _range,
                  fractionDigits: 0,
                ),
              ],
            );
          },
        ),
      ],
    );
  }
}

class _DoorBody extends StatelessWidget {
  const _DoorBody({required this.device});

  final CustomerDevice device;

  @override
  Widget build(BuildContext context) {
    final open = device.latest?.doorOpen;
    final color = open == null
        ? AppColors.offline
        : (open ? AppColors.warning : AppColors.success);
    final label = open == null
        ? 'Chưa có dữ liệu'
        : (open ? 'Cửa đang mở' : 'Cửa đang đóng');
    return AppCard(
      child: Row(
        children: [
          IconBadge(
            icon: open == true
                ? Icons.meeting_room_outlined
                : Icons.sensor_door_outlined,
            color: color,
            size: 28,
            padding: 14,
          ),
          const SizedBox(width: 14),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  label,
                  style: TextStyle(
                    fontSize: 18,
                    fontWeight: FontWeight.bold,
                    color: color,
                  ),
                ),
                const SizedBox(height: 2),
                Text(
                  device.latest?.receivedAt != null
                      ? 'Cập nhật ${formatRelative(device.latest!.receivedAt!)}'
                      : formatLastOnline(device.lastSeen),
                  style: const TextStyle(
                    color: AppColors.textSecondary,
                    fontSize: 12,
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

class _InfoCard extends StatelessWidget {
  const _InfoCard({required this.device});

  final CustomerDevice device;

  @override
  Widget build(BuildContext context) {
    return AppCard(
      child: Column(
        children: [
          _InfoRow('Loại thiết bị', deviceTypeLabel(device)),
          if (device.roomName != null) _InfoRow('Phòng', device.roomName!),
          _InfoRow(
            'Trạng thái',
            device.online
                ? 'Online'
                : 'Ngoại tuyến · ${formatLastOnline(device.lastSeen)}',
          ),
          _InfoRow('Mã thiết bị', device.deviceUid, selectable: true),
        ],
      ),
    );
  }
}

class _InfoRow extends StatelessWidget {
  const _InfoRow(this.label, this.value, {this.selectable = false});

  final String label;
  final String value;
  final bool selectable;

  @override
  Widget build(BuildContext context) {
    const valueStyle = TextStyle(
      color: AppColors.textPrimary,
      fontWeight: FontWeight.w600,
      fontSize: 13,
    );
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 6),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          SizedBox(
            width: 104,
            child: Text(
              label,
              style: const TextStyle(
                color: AppColors.textSecondary,
                fontSize: 13,
              ),
            ),
          ),
          Expanded(
            child: selectable
                ? SelectableText(value, style: valueStyle)
                : Text(value, style: valueStyle),
          ),
        ],
      ),
    );
  }
}
