import 'package:flutter/material.dart';

import '../../../about/presentation/pages/about_page.dart';
import '../../../auth/models/mock_user.dart';
import '../../../door/presentation/pages/door_page.dart';
import '../../../home/presentation/pages/home_page.dart';
import '../../../notifications/presentation/pages/notification_page.dart';
import '../../../profile/presentation/pages/profile_page.dart';
import '../../../rooms/presentation/pages/room_list_page.dart';
import '../widgets/bottom_nav_bar.dart';

class AppShellPage extends StatefulWidget {
  const AppShellPage({super.key, required this.user});

  final MockUser user;

  @override
  State<AppShellPage> createState() => _AppShellPageState();
}

class _AppShellPageState extends State<AppShellPage> {
  int _selectedIndex = 0;

  static const _navItems = [
    BottomNavItem(
      label: 'Home',
      icon: Icons.home_outlined,
      selectedIcon: Icons.home,
    ),
    BottomNavItem(
      label: 'Room',
      icon: Icons.meeting_room_outlined,
      selectedIcon: Icons.meeting_room,
    ),
    BottomNavItem(
      label: 'Door',
      icon: Icons.sensor_door_outlined,
      selectedIcon: Icons.sensor_door,
    ),
    BottomNavItem(
      label: 'Notifications',
      icon: Icons.notifications_outlined,
      selectedIcon: Icons.notifications,
    ),
    BottomNavItem(
      label: 'About',
      icon: Icons.info_outline,
      selectedIcon: Icons.info,
    ),
    BottomNavItem(
      label: 'Profile',
      icon: Icons.person_outline,
      selectedIcon: Icons.person,
    ),
  ];

  Widget get _currentPage {
    switch (_selectedIndex) {
      case 1:
        return const RoomListPage();
      case 2:
        return const DoorPage();
      case 3:
        return const NotificationPage();
      case 4:
        return const AboutPage();
      case 5:
        return ProfilePage(user: widget.user);
      default:
        return HomePage(user: widget.user);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: AnimatedSwitcher(
        duration: const Duration(milliseconds: 250),
        transitionBuilder: (child, animation) => FadeTransition(
          opacity: animation,
          child: child,
        ),
        child: KeyedSubtree(
          key: ValueKey<int>(_selectedIndex),
          child: _currentPage,
        ),
      ),
      bottomNavigationBar: AppBottomNavigationBar(
        items: _navItems,
        selectedIndex: _selectedIndex,
        onSelected: (index) => setState(() => _selectedIndex = index),
      ),
    );
  }
}
