import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../../core/navigation/app_routes.dart';
import '../../../../core/network/error_messages.dart';
import '../../../../core/widgets/app_feedback.dart';
import '../../../../core/widgets/app_widgets.dart';
import '../../../../core/widgets/async_views.dart';
import '../../application/homes_providers.dart';
import '../../ui/room_card.dart';

/// "Phòng" tab (FR-5.2): every room of the selected home with its climate.
class RoomListPage extends ConsumerWidget {
  const RoomListPage({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final home = ref.watch(currentHomeProvider);
    final overview = ref.watch(currentOverviewProvider);

    Future<void> refresh() async {
      if (home == null) return;
      final messenger = ScaffoldMessenger.maybeOf(context);
      try {
        await ref
            .read(homeOverviewProvider(home.id).notifier)
            .refresh(throwOnError: true);
      } on Object catch (error) {
        showAppSnack(messenger, userMessageFor(error), error: true);
      }
    }

    return Scaffold(
      appBar: AppBar(
        automaticallyImplyLeading: false,
        title: const Text('Phòng'),
      ),
      body: AsyncValueView(
        value: overview,
        onRetry: home == null
            ? null
            : () => ref.invalidate(homeOverviewProvider(home.id)),
        builder: (data) {
          if (data.rooms.isEmpty) {
            return RefreshIndicator(
              onRefresh: refresh,
              child: ListView(
                physics: const AlwaysScrollableScrollPhysics(),
                children: const [
                  SizedBox(height: 120),
                  EmptyState(
                    icon: Icons.meeting_room_outlined,
                    title: 'Chưa có phòng nào',
                    message:
                        'Phòng sẽ xuất hiện sau khi đơn vị lắp đặt hoàn tất cấu hình Smart Home.',
                  ),
                ],
              ),
            );
          }
          return RefreshIndicator(
            onRefresh: refresh,
            child: CustomScrollView(
              physics: const AlwaysScrollableScrollPhysics(),
              slivers: [
                if (data.gatewayOffline)
                  const SliverPadding(
                    padding: EdgeInsets.fromLTRB(20, 0, 20, 16),
                    sliver: SliverToBoxAdapter(
                      child: InlineBanner(
                        kind: BannerKind.warning,
                        message:
                            'Gateway ngoại tuyến — số liệu phòng có thể không cập nhật.',
                      ),
                    ),
                  ),
                SliverPadding(
                  padding: const EdgeInsets.fromLTRB(20, 0, 20, 20),
                  sliver: SliverGrid.builder(
                    itemCount: data.rooms.length,
                    gridDelegate:
                        const SliverGridDelegateWithFixedCrossAxisCount(
                          crossAxisCount: 2,
                          mainAxisSpacing: 16,
                          crossAxisSpacing: 16,
                          childAspectRatio: 1.1,
                        ),
                    itemBuilder: (context, index) {
                      final room = data.rooms[index];
                      return RoomCard(
                        room: room,
                        onTap: () => Navigator.of(context).openRoom(
                          homeId: data.home.id,
                          roomId: room.id,
                        ),
                      );
                    },
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
