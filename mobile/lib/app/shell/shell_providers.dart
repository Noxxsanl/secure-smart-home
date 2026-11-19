import 'package:flutter_riverpod/flutter_riverpod.dart';

/// Bottom navigation tabs (docs/architecture/MOBILE_APP_ARCHITECTURE.md §4.2):
/// Trang chủ / Tự động / [nút mic Trợ lý ở giữa] /
/// Thông báo / Hồ sơ.
enum ShellTab { home, automation, notifications, profile }

class ShellTabNotifier extends Notifier<ShellTab> {
  @override
  ShellTab build() => ShellTab.home;

  void select(ShellTab tab) => state = tab;
}

final shellTabProvider = NotifierProvider<ShellTabNotifier, ShellTab>(
  ShellTabNotifier.new,
);
