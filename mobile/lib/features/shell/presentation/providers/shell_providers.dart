import 'package:flutter_riverpod/flutter_riverpod.dart';

/// Bottom navigation tabs (docs/07 §4.2): Trang chủ / Phòng / Tự động /
/// Thông báo / Hồ sơ.
enum ShellTab { home, rooms, automation, notifications, profile }

class ShellTabNotifier extends Notifier<ShellTab> {
  @override
  ShellTab build() => ShellTab.home;

  void select(ShellTab tab) => state = tab;
}

final shellTabProvider = NotifierProvider<ShellTabNotifier, ShellTab>(
  ShellTabNotifier.new,
);
