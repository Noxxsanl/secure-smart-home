import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../modules/ai/ai_module.dart';
import '../../modules/auth/auth_module.dart';
import '../../modules/automation/automation_module.dart';
import '../../modules/homes/homes_module.dart';
import '../../modules/notifications/notifications.dart';
import '../../modules/notifications/notifications_module.dart';
import '../realtime_controller.dart';
import 'bottom_nav_bar.dart';
import 'shell_providers.dart';

/// Bottom-navigation shell: Trang chủ / Tự động / [mic Trợ lý] / Thông báo /
/// Hồ sơ. Keeps the realtime channel alive while it is on screen and refreshes the
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
        center: const AssistantNavMic(),
        items: items,
        selectedIndex: tab.index,
        onSelected: (index) =>
            ref.read(shellTabProvider.notifier).select(ShellTab.values[index]),
      ),
    );
  }
}
