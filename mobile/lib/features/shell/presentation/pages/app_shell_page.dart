import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../automation/presentation/pages/automation_page.dart';
import '../../../homes/presentation/pages/home_page.dart';
import '../../../notifications/presentation/pages/notification_page.dart';
import '../../../notifications/presentation/providers/notification_providers.dart';
import '../../../profile/presentation/pages/profile_page.dart';
import '../../../rooms/presentation/pages/room_list_page.dart';
import '../providers/realtime_controller.dart';
import '../providers/shell_providers.dart';
import '../widgets/bottom_nav_bar.dart';

/// Bottom-navigation shell: Trang chủ / Phòng / Tự động / Thông báo / Hồ sơ.
/// Keeps the realtime channel alive while it is on screen and refreshes the
/// data when the app returns from the background.
class AppShellPage extends ConsumerStatefulWidget {
  const AppShellPage({super.key});

  @override
  ConsumerState<AppShellPage> createState() => _AppShellPageState();
}

class _AppShellPageState extends ConsumerState<AppShellPage>
    with WidgetsBindingObserver {
  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    super.dispose();
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (state == AppLifecycleState.resumed && mounted) {
      unawaited(ref.read(realtimeControllerProvider.notifier).syncNow());
    }
  }

  static const _pages = <ShellTab, Widget>{
    ShellTab.home: HomePage(),
    ShellTab.rooms: RoomListPage(),
    ShellTab.automation: AutomationPage(),
    ShellTab.notifications: NotificationPage(),
    ShellTab.profile: ProfilePage(),
  };

  @override
  Widget build(BuildContext context) {
    ref.watch(realtimeControllerProvider);
    final tab = ref.watch(shellTabProvider);
    final unread = ref.watch(unreadCountProvider);

    final items = [
      const BottomNavItem(
        label: 'Trang chủ',
        icon: Icons.home_outlined,
        selectedIcon: Icons.home,
      ),
      const BottomNavItem(
        label: 'Phòng',
        icon: Icons.meeting_room_outlined,
        selectedIcon: Icons.meeting_room,
      ),
      const BottomNavItem(
        label: 'Tự động',
        icon: Icons.auto_mode_outlined,
        selectedIcon: Icons.auto_mode,
      ),
      BottomNavItem(
        label: 'Thông báo',
        icon: Icons.notifications_outlined,
        selectedIcon: Icons.notifications,
        badgeCount: unread,
      ),
      const BottomNavItem(
        label: 'Hồ sơ',
        icon: Icons.person_outline,
        selectedIcon: Icons.person,
      ),
    ];

    return Scaffold(
      body: AnimatedSwitcher(
        duration: const Duration(milliseconds: 250),
        transitionBuilder: (child, animation) =>
            FadeTransition(opacity: animation, child: child),
        child: KeyedSubtree(key: ValueKey<ShellTab>(tab), child: _pages[tab]!),
      ),
      bottomNavigationBar: AppBottomNavigationBar(
        items: items,
        selectedIndex: tab.index,
        onSelected: (index) =>
            ref.read(shellTabProvider.notifier).select(ShellTab.values[index]),
      ),
    );
  }
}
