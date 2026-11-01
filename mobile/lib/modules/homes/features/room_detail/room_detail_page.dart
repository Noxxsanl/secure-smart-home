import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../../core/navigation/app_routes.dart';
import '../../../../core/network/error_messages.dart';
import '../../../../core/theme/app_theme.dart';
import '../../../../core/utils/date_format.dart';
import '../../../../core/widgets/app_feedback.dart';
import '../../../../core/widgets/app_widgets.dart';
import '../../../../core/widgets/async_views.dart';
import '../../../../core/widgets/circular_gauge.dart';
import '../../../devices/devices.dart';
import '../../application/homes_providers.dart';
import '../../domain/overview.dart';
import '../../domain/room.dart';
import '../../ui/room_presentation.dart';

/// Room detail (FR-5.2): climate gauge, counters and realtime device rows.
class RoomDetailPage extends ConsumerStatefulWidget {
  const RoomDetailPage({super.key, required this.homeId, required this.roomId});

  final int homeId;
  final int roomId;

  @override
  ConsumerState<RoomDetailPage> createState() => _RoomDetailPageState();
}

class _RoomDetailPageState extends ConsumerState<RoomDetailPage> {
  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (!mounted) return;
      unawaited(
        ref
            .read(homeOverviewProvider(widget.homeId).notifier)
            .refreshRoom(widget.roomId),
      );
    });
  }

  Future<void> _rename(RoomSummary room) async {
    final name = await promptText(
      context,
      title: 'Đổi tên phòng',
      label: 'Tên phòng',
      initial: room.name,
    );
    if (name == null || name == room.name || !mounted) return;
    await runAction(
      context,
      () => ref
          .read(homeOverviewProvider(widget.homeId).notifier)
          .renameRoom(room.id, name),
      successMessage: 'Đã đổi tên phòng.',
    );
  }

  Future<void> _refresh() async {
    final messenger = ScaffoldMessenger.maybeOf(context);
    try {
      await ref
          .read(homeOverviewProvider(widget.homeId).notifier)
          .refresh(throwOnError: true);
    } on Object catch (error) {
      showAppSnack(messenger, userMessageFor(error), error: true);
    }
  }

  @override
  Widget build(BuildContext context) {
    final overview = ref.watch(homeOverviewProvider(widget.homeId));
    final room = overview.value?.roomById(widget.roomId);
    final canRename = overview.value?.role.canRename ?? false;

    return Scaffold(
      appBar: AppBar(
        title: Text(room?.name ?? 'Phòng'),
        actions: [
          if (room != null && canRename)
            IconButton(
              tooltip: 'Đổi tên phòng',
              icon: const Icon(Icons.edit_outlined),
              onPressed: () => _rename(room),
            ),
        ],
      ),
      body: AsyncValueView<HomeOverview>(
        value: overview,
        onRetry: () => ref.invalidate(homeOverviewProvider(widget.homeId)),
        builder: (data) {
          final current = data.roomById(widget.roomId);
          if (current == null) {
            return const EmptyState(
              icon: Icons.meeting_room_outlined,
              title: 'Phòng không còn tồn tại',
              message:
                  'Phòng có thể đã bị xoá hoặc bạn không còn quyền truy cập. Quay lại và kéo xuống để tải lại.',
            );
          }
          final devices = data.devicesInRoom(current.id);
          final temperature = current.temperature;
          return RefreshIndicator(
            onRefresh: _refresh,
            child: ListView(
              physics: const AlwaysScrollableScrollPhysics(),
              padding: const EdgeInsets.fromLTRB(20, 8, 20, 24),
              children: [
                if (data.gatewayOffline) ...[
                  const InlineBanner(
                    kind: BannerKind.warning,
                    message:
                        'Gateway ngoại tuyến — số liệu có thể không cập nhật.',
                  ),
                  const SizedBox(height: 16),
                ],
                Center(
                  child: current.hasClimateData && temperature != null
                      ? CircularGauge(
                          value: temperature,
                          min: 10,
                          max: 40,
                          size: 210,
                          child: Column(
                            mainAxisSize: MainAxisSize.min,
                            children: [
                              Text(
                                formatTemperature(temperature),
                                style: const TextStyle(
                                  fontSize: 36,
                                  fontWeight: FontWeight.bold,
                                  color: AppColors.textPrimary,
                                ),
                              ),
                              const Text(
                                'Nhiệt độ',
                                style: TextStyle(color: AppColors.textSecondary),
                              ),
                            ],
                          ),
                        )
                      : Container(
                          width: 120,
                          height: 120,
                          decoration: const BoxDecoration(
                            color: AppColors.surfaceTint,
                            shape: BoxShape.circle,
                          ),
                          child: Icon(
                            roomIcon(current.roomType),
                            size: 56,
                            color: AppColors.primary,
                          ),
                        ),
                ),
                const SizedBox(height: 20),
                Row(
                  children: [
                    _StatTile(
                      label: 'Độ ẩm',
                      value: current.hasClimateData
                          ? formatHumidity(current.humidity)
                          : '--',
                    ),
                    _StatTile(
                      label: 'Online',
                      value: '${current.onlineCount}/${current.deviceCount}',
                    ),
                    _StatTile(
                      label: 'Đang bật',
                      value: '${current.onCount}',
                    ),
                  ],
                ),
                if (current.climateUpdatedAt != null) ...[
                  const SizedBox(height: 6),
                  Center(
                    child: Text(
                      'Cập nhật ${formatRelative(current.climateUpdatedAt!)}',
                      style: const TextStyle(
                        fontSize: 11,
                        color: AppColors.textSecondary,
                      ),
                    ),
                  ),
                ],
                const SizedBox(height: 24),
                const SectionHeader('Thiết bị'),
                if (devices.isEmpty)
                  const Padding(
                    padding: EdgeInsets.symmetric(vertical: 24),
                    child: Text(
                      'Chưa có thiết bị nào trong phòng này.',
                      style: TextStyle(color: AppColors.textSecondary),
                    ),
                  )
                else
                  for (final device in devices)
                    Padding(
                      padding: const EdgeInsets.only(bottom: 12),
                      child: DeviceRow(
                        device: device,
                        homeSuspended: data.home.isSuspended,
                        onTap: () => Navigator.of(context).openDevice(
                          homeId: data.home.id,
                          deviceId: device.id,
                        ),
                      ),
                    ),
              ],
            ),
          );
        },
      ),
    );
  }
}

class _StatTile extends StatelessWidget {
  const _StatTile({required this.label, required this.value});

  final String label;
  final String value;

  @override
  Widget build(BuildContext context) {
    return Expanded(
      child: Column(
        children: [
          Text(
            value,
            style: const TextStyle(
              fontSize: 18,
              fontWeight: FontWeight.bold,
              color: AppColors.textPrimary,
            ),
          ),
          const SizedBox(height: 4),
          Text(
            label,
            style: const TextStyle(fontSize: 12, color: AppColors.textSecondary),
          ),
        ],
      ),
    );
  }
}
