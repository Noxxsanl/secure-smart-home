import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../../core/network/error_messages.dart';
import '../../../../core/theme/app_theme.dart';
import '../../../../core/utils/date_format.dart';
import '../../../../core/widgets/app_feedback.dart';
import '../../../../core/widgets/app_widgets.dart';
import '../../../../core/widgets/async_views.dart';
import '../../../auth/presentation/providers/auth_providers.dart';
import '../../../automation/presentation/providers/automation_providers.dart';
import '../../../automation/presentation/widgets/suggestion_card.dart';
import '../../../devices/presentation/pages/device_detail_page.dart';
import '../../../devices/presentation/widgets/device_tile.dart';
import '../../../rooms/presentation/pages/room_detail_page.dart';
import '../../../rooms/presentation/widgets/room_card.dart';
import '../../domain/home.dart';
import '../../domain/overview.dart';
import '../providers/homes_providers.dart';
import '../widgets/home_switcher.dart';

/// "Trang chủ" (FR-5.1): home name + role, gateway status, per-room climate,
/// devices on, open alerts, AI suggestions, quick relay controls, rooms.
class HomePage extends ConsumerWidget {
  const HomePage({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final home = ref.watch(currentHomeProvider);
    if (home == null) return const Scaffold(body: LoadingView());
    final overview = ref.watch(homeOverviewProvider(home.id));

    Future<void> rename() async {
      final name = await promptText(
        context,
        title: 'Đổi tên nhà',
        label: 'Tên nhà',
        initial: home.home.name,
        maxLength: 128,
      );
      if (name == null || name == home.home.name || !context.mounted) return;
      await runAction(
        context,
        () => ref.read(homeOverviewProvider(home.id).notifier).renameHome(name),
        successMessage: 'Đã đổi tên nhà.',
      );
    }

    return Scaffold(
      appBar: AppBar(
        automaticallyImplyLeading: false,
        titleSpacing: 16,
        title: HomeSwitcherButton(home: home),
        actions: [
          if (home.role.canRename)
            IconButton(
              tooltip: 'Đổi tên nhà',
              icon: const Icon(Icons.edit_outlined),
              onPressed: rename,
            ),
        ],
      ),
      body: AsyncValueView<HomeOverview>(
        value: overview,
        onRetry: () => ref.invalidate(homeOverviewProvider(home.id)),
        builder: (data) => RefreshIndicator(
          onRefresh: () async {
            final messenger = ScaffoldMessenger.maybeOf(context);
            try {
              await ref
                  .read(homeOverviewProvider(home.id).notifier)
                  .refresh(throwOnError: true);
              await ref.read(suggestionsProvider(home.id).notifier).refresh();
            } on Object catch (error) {
              showAppSnack(messenger, userMessageFor(error), error: true);
            }
          },
          child: _HomeContent(home: home, overview: data),
        ),
      ),
    );
  }
}

class _HomeContent extends ConsumerWidget {
  const _HomeContent({required this.home, required this.overview});

  final MyHome home;
  final HomeOverview overview;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final user = ref.watch(authControllerProvider.select((s) => s.user));
    final suggestions = (ref.watch(suggestionsProvider(home.id)).value ?? [])
        .where((s) => s.isPending)
        .toList();
    final relays = overview.relays;
    final gateway = overview.gateway;

    return ListView(
      physics: const AlwaysScrollableScrollPhysics(),
      padding: const EdgeInsets.fromLTRB(20, 4, 20, 28),
      children: [
        Row(
          children: [
            Expanded(
              child: Text(
                'Xin chào, ${user?.firstName ?? ''}',
                style: const TextStyle(
                  fontSize: 22,
                  fontWeight: FontWeight.bold,
                  color: AppColors.textPrimary,
                ),
              ),
            ),
            StatusPill(home.role.label),
          ],
        ),
        const SizedBox(height: 16),
        if (overview.home.isSuspended) ...[
          const InlineBanner(
            kind: BannerKind.error,
            message:
                'Nhà đang tạm ngưng dịch vụ nên chưa điều khiển được thiết bị. Vui lòng liên hệ bộ phận hỗ trợ.',
          ),
          const SizedBox(height: 12),
        ],
        if (gateway != null)
          AppCard(
            child: Row(
              children: [
                IconBadge(
                  icon: Icons.router_outlined,
                  color: gateway.online ? AppColors.success : AppColors.offline,
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      const Text(
                        'Gateway',
                        style: TextStyle(fontWeight: FontWeight.bold),
                      ),
                      Text(
                        gateway.online
                            ? 'Đang hoạt động'
                            : formatLastOnline(gateway.lastSeen),
                        style: const TextStyle(
                          fontSize: 12,
                          color: AppColors.textSecondary,
                        ),
                      ),
                    ],
                  ),
                ),
                StatusPill(
                  gateway.online ? 'Online' : 'Ngoại tuyến',
                  color: gateway.online ? AppColors.success : AppColors.offline,
                ),
              ],
            ),
          ),
        if (overview.gatewayOffline) ...[
          const SizedBox(height: 12),
          const InlineBanner(
            kind: BannerKind.warning,
            message:
                'Gateway ngoại tuyến — dữ liệu có thể không cập nhật và chưa điều khiển được. Kiểm tra nguồn điện và WiFi của Gateway.',
          ),
        ],
        const SizedBox(height: 16),
        Row(
          children: [
            _Stat(
              icon: Icons.power_settings_new,
              value: '${overview.onCount}',
              label: 'Thiết bị đang bật',
            ),
            const SizedBox(width: 10),
            _Stat(
              icon: Icons.wifi_tethering,
              value: '${overview.onlineCount}/${overview.devices.length}',
              label: 'Đang online',
            ),
            const SizedBox(width: 10),
            _Stat(
              icon: Icons.notifications_active_outlined,
              value: '${overview.openAlerts}',
              label: 'Cảnh báo',
              color: overview.openAlerts > 0
                  ? AppColors.warning
                  : AppColors.primary,
            ),
          ],
        ),
        if (suggestions.isNotEmpty) ...[
          const SizedBox(height: 20),
          for (final s in suggestions) ...[
            SuggestionCard(
              suggestion: s,
              canRespond: home.role.canEditAutomation,
            ),
            const SizedBox(height: 12),
          ],
        ],
        const SizedBox(height: 20),
        const SectionHeader('Điều khiển nhanh'),
        if (relays.isEmpty)
          const Text(
            'Chưa có thiết bị bật/tắt nào.',
            style: TextStyle(color: AppColors.textSecondary),
          )
        else
          GridView.builder(
            shrinkWrap: true,
            physics: const NeverScrollableScrollPhysics(),
            itemCount: relays.length,
            gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
              crossAxisCount: 2,
              mainAxisSpacing: 16,
              crossAxisSpacing: 16,
              childAspectRatio: 0.95,
            ),
            itemBuilder: (context, index) {
              final device = relays[index];
              return DeviceTile(
                device: device,
                homeSuspended: overview.home.isSuspended,
                onTap: () => Navigator.of(context).push(
                  MaterialPageRoute<void>(
                    builder: (_) => DeviceDetailPage(
                      homeId: home.id,
                      deviceId: device.id,
                    ),
                  ),
                ),
              );
            },
          ),
        const SizedBox(height: 24),
        const SectionHeader('Phòng'),
        GridView.builder(
          shrinkWrap: true,
          physics: const NeverScrollableScrollPhysics(),
          itemCount: overview.rooms.length,
          gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
            crossAxisCount: 2,
            mainAxisSpacing: 16,
            crossAxisSpacing: 16,
            childAspectRatio: 1.1,
          ),
          itemBuilder: (context, index) {
            final room = overview.rooms[index];
            return RoomCard(
              room: room,
              onTap: () => Navigator.of(context).push(
                MaterialPageRoute<void>(
                  builder: (_) =>
                      RoomDetailPage(homeId: home.id, roomId: room.id),
                ),
              ),
            );
          },
        ),
      ],
    );
  }
}

class _Stat extends StatelessWidget {
  const _Stat({
    required this.icon,
    required this.value,
    required this.label,
    this.color = AppColors.primary,
  });

  final IconData icon;
  final String value;
  final String label;
  final Color color;

  @override
  Widget build(BuildContext context) {
    return Expanded(
      child: AppCard(
        radius: 20,
        padding: const EdgeInsets.all(12),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Icon(icon, size: 20, color: color),
            const SizedBox(height: 8),
            Text(
              value,
              style: const TextStyle(
                fontSize: 20,
                fontWeight: FontWeight.bold,
                color: AppColors.textPrimary,
              ),
            ),
            Text(
              label,
              style: const TextStyle(
                fontSize: 11,
                color: AppColors.textSecondary,
              ),
            ),
          ],
        ),
      ),
    );
  }
}
