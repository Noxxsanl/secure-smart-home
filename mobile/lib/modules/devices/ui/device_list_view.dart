import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/navigation/app_routes.dart';
import '../../../core/theme/app_theme.dart';
import '../../../core/utils/date_format.dart';
import '../../../core/widgets/app_widgets.dart';
import '../../../core/widgets/async_views.dart';
import '../../homes/homes.dart';
import '../domain/device.dart';
import 'device_row.dart';

/// Room left under the list.
const _bottomPadding = 24.0;

enum DeviceFilter {
  all('Tất cả'),
  on('Đang bật'),
  offline('Offline');

  const DeviceFilter(this.label);

  final String label;

  bool accepts(CustomerDevice device) => switch (this) {
    DeviceFilter.all => true,
    DeviceFilter.on => device.isRelay && device.isOn,
    DeviceFilter.offline => !device.online,
  };
}

/// Why the caller can only look (VIEWER) or only use some devices (GUEST), or
/// `null` for a role that controls everything (web `HomeDeviceListPage`).
String? deviceRoleNotice(
  HomeRole role, {
  DateTime? guestExpiresAt,
}) => switch (role) {
  HomeRole.viewer =>
    'Với vai trò ${HomeRole.viewer.label}, bạn chỉ xem được trạng thái '
        'thiết bị. Nhờ chủ nhà nâng quyền nếu cần điều khiển.',
  HomeRole.guest =>
    'Bạn đang truy cập với vai trò ${HomeRole.guest.label}: chỉ thấy và '
        'điều khiển các thiết bị chủ nhà đã chỉ định.'
        '${guestExpiresAt == null ? '' : ' Quyền khách có hiệu lực đến ${formatDate(guestExpiresAt)}.'}',
  _ => null,
};

/// Every device of the home except the gateway, grouped by room (then
/// "Chưa gán phòng"), with the filter "Tất cả / Đang bật / Offline". Rows carry
/// the same controls as the room page (switch, curtain levels, set point); a tap
/// opens the device page and a tap on a room name opens the room page.
class DeviceListView extends ConsumerStatefulWidget {
  const DeviceListView({
    super.key,
    required this.overview,
    required this.onRefresh,
  });

  final HomeOverview overview;

  /// Pull to refresh.
  final Future<void> Function() onRefresh;

  @override
  ConsumerState<DeviceListView> createState() => _DeviceListViewState();
}

class _DeviceListViewState extends ConsumerState<DeviceListView> {
  DeviceFilter _filter = DeviceFilter.all;

  @override
  Widget build(BuildContext context) {
    final overview = widget.overview;
    final guestExpiresAt = ref.watch(
      currentHomeProvider.select((home) => home?.expiresAt),
    );
    final all = [
      for (final d in overview.devices)
        if (d.category != DeviceCategory.gateway) d,
    ];
    final shown = [
      for (final d in all)
        if (_filter.accepts(d)) d,
    ];
    final roomIds = {for (final room in overview.rooms) room.id};

    final groups =
        <({String key, String title, int? roomId, List<CustomerDevice> items})>[
          for (final room in overview.rooms)
            (
              key: 'room-${room.id}',
              title: room.name,
              roomId: room.id,
              items: [
                for (final d in shown)
                  if (d.roomId == room.id) d,
              ],
            ),
          (
            key: 'unassigned',
            title: 'Chưa gán phòng',
            roomId: null,
            items: [
              for (final d in shown)
                if (d.roomId == null || !roomIds.contains(d.roomId)) d,
            ],
          ),
        ].where((group) => group.items.isNotEmpty).toList();

    final notice = deviceRoleNotice(
      overview.role,
      guestExpiresAt: guestExpiresAt,
    );

    return RefreshIndicator(
      onRefresh: widget.onRefresh,
      child: ListView(
        key: const ValueKey<String>('device-list-view'),
        physics: const AlwaysScrollableScrollPhysics(),
        padding: const EdgeInsets.fromLTRB(20, 4, 20, _bottomPadding),
        children: [
          Text(
            '${all.length} thiết bị, nhóm theo phòng.',
            style: const TextStyle(color: AppColors.textSecondary),
          ),
          const SizedBox(height: 12),
          Wrap(
            spacing: 8,
            runSpacing: 8,
            children: [
              for (final filter in DeviceFilter.values)
                ChoicePill(
                  key: ValueKey<String>('device-filter-${filter.name}'),
                  label: filter.label,
                  selected: _filter == filter,
                  onTap: () => setState(() => _filter = filter),
                ),
            ],
          ),
          if (overview.gatewayOffline) ...[
            const SizedBox(height: 12),
            const InlineBanner(
              kind: BannerKind.warning,
              message:
                  'Gateway ngoại tuyến — trạng thái thiết bị có thể không cập nhật.',
            ),
          ],
          if (notice != null) ...[
            const SizedBox(height: 12),
            InlineBanner(message: notice),
          ],
          const SizedBox(height: 16),
          if (groups.isEmpty)
            Padding(
              padding: const EdgeInsets.only(top: 24),
              child: EmptyState(
                icon: Icons.devices_other_outlined,
                title: all.isEmpty
                    ? 'Chưa có thiết bị nào'
                    : 'Không có thiết bị phù hợp',
                message: all.isEmpty
                    ? 'Thiết bị trong kit sẽ hiện ở đây sau khi Gateway được cài đặt WiFi.'
                    : 'Thử đổi bộ lọc.',
              ),
            )
          else
            for (final group in groups) ...[
              _GroupHeader(
                key: ValueKey<String>('group-${group.key}'),
                title: group.title,
                onTap: group.roomId == null
                    ? null
                    : () => Navigator.of(context).openRoom(
                        homeId: overview.home.id,
                        roomId: group.roomId!,
                      ),
              ),
              for (final device in group.items)
                Padding(
                  padding: const EdgeInsets.only(bottom: 12),
                  child: DeviceRow(
                    key: ValueKey<String>('device-row-${device.id}'),
                    device: device,
                    homeSuspended: overview.home.isSuspended,
                    onTap: () => Navigator.of(
                      context,
                    ).openDevice(homeId: overview.home.id, deviceId: device.id),
                  ),
                ),
              const SizedBox(height: 8),
            ],
        ],
      ),
    );
  }
}

/// Group title; a room's title is tappable (room page: rename + climate), the
/// "Chưa gán phòng" group is not.
class _GroupHeader extends StatelessWidget {
  const _GroupHeader({super.key, required this.title, this.onTap});

  final String title;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    final header = SectionHeader(
      title,
      trailing: onTap == null
          ? null
          : const Icon(Icons.chevron_right, color: AppColors.textSecondary),
    );
    if (onTap == null) return header;
    return InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(8),
      child: header,
    );
  }
}
