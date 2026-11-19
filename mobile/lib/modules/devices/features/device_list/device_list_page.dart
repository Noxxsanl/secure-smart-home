import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../../core/network/error_messages.dart';
import '../../../../core/widgets/app_feedback.dart';
import '../../../../core/widgets/async_views.dart';
import '../../../homes/homes.dart';
import '../../ui/device_list_view.dart';

/// "Thiết bị" page opened from the home screen ("Tất cả thiết bị"): every
/// device of the home grouped by room, with the filter and the same controls
/// as the rooms; pull to refresh.
class DeviceListPage extends ConsumerWidget {
  const DeviceListPage({super.key, required this.homeId});

  final int homeId;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final overview = ref.watch(homeOverviewProvider(homeId));

    Future<void> refresh() async {
      final messenger = ScaffoldMessenger.maybeOf(context);
      try {
        await ref
            .read(homeOverviewProvider(homeId).notifier)
            .refresh(throwOnError: true);
      } on Object catch (error) {
        showAppSnack(messenger, userMessageFor(error), error: true);
      }
    }

    return Scaffold(
      appBar: AppBar(title: const Text('Thiết bị')),
      body: AsyncValueView<HomeOverview>(
        value: overview,
        onRetry: () => ref.invalidate(homeOverviewProvider(homeId)),
        builder: (data) => DeviceListView(overview: data, onRefresh: refresh),
      ),
    );
  }
}
