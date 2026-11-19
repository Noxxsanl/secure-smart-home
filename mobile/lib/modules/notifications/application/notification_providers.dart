import 'package:flutter/foundation.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/config/app_config.dart';
import '../../../core/network/network_providers.dart';
import '../../../mock/mock_providers.dart';
import '../../auth/auth.dart';
import '../../homes/homes.dart';
import '../data/notification_mock_repository.dart';
import '../data/notification_remote_repository.dart';
import '../domain/app_notification.dart';
import '../domain/notification_repository.dart';

final notificationRepositoryProvider = Provider<NotificationRepository>((ref) {
  final config = ref.watch(appConfigProvider);
  if (config.useMock) {
    return MockNotificationRepository(ref.watch(mockBackendProvider));
  }
  return RemoteNotificationRepository(ref.watch(apiClientProvider));
});

@immutable
class NotificationsState {
  const NotificationsState({this.items = const [], this.unreadCount = 0});

  /// Newest first, across all my homes (the screen filters by home).
  final List<AppNotification> items;
  final int unreadCount;

  NotificationsState copyWith({
    List<AppNotification>? items,
    int? unreadCount,
  }) => NotificationsState(
    items: items ?? this.items,
    unreadCount: unreadCount ?? this.unreadCount,
  );
}

/// Notification centre + the unread badge (FR-8.2).
class NotificationsNotifier extends AsyncNotifier<NotificationsState> {
  @override
  Future<NotificationsState> build() async {
    final userId = ref.watch(sessionUserIdProvider);
    final repository = ref.watch(notificationRepositoryProvider);
    if (userId == null) return const NotificationsState();
    final page = await repository.list(limit: 50);
    return NotificationsState(items: page.items, unreadCount: page.unreadCount);
  }

  Future<void> refresh({bool throwOnError = false}) async {
    try {
      final page = await ref
          .read(notificationRepositoryProvider)
          .list(limit: 50);
      if (!ref.mounted) return;
      state = AsyncData(
        NotificationsState(items: page.items, unreadCount: page.unreadCount),
      );
    } on Object {
      if (throwOnError) rethrow;
    }
  }

  void _adjustOverview(AppNotification notification, int delta) {
    final homeId = notification.homeId;
    if (homeId == null || !ref.exists(homeOverviewProvider(homeId))) return;
    ref
        .read(homeOverviewProvider(homeId).notifier)
        .adjustUnread(delta: delta, isAlert: notification.severity.isAlert);
  }

  /// Optimistic; reverts when the server refuses.
  Future<void> markRead(int id) async {
    final current = state.value;
    if (current == null) return;
    AppNotification? target;
    for (final item in current.items) {
      if (item.id == id) target = item;
    }
    if (target == null || target.isRead) return;

    state = AsyncData(
      current.copyWith(
        items: [
          for (final item in current.items)
            item.id == id ? item.copyWith(isRead: true) : item,
        ],
        unreadCount: current.unreadCount > 0 ? current.unreadCount - 1 : 0,
      ),
    );
    _adjustOverview(target, -1);
    try {
      await ref.read(notificationRepositoryProvider).markRead(id);
    } on Object {
      if (ref.mounted) {
        state = AsyncData(current);
        _adjustOverview(target, 1);
      }
      rethrow;
    }
  }

  /// [homeId] null = every home.
  Future<void> markAllRead({int? homeId}) async {
    final current = state.value;
    if (current == null) return;
    final affected = current.items
        .where((n) => !n.isRead && (homeId == null || n.homeId == homeId))
        .toList();
    if (affected.isEmpty) return;

    state = AsyncData(
      current.copyWith(
        items: [
          for (final item in current.items)
            affected.any((n) => n.id == item.id)
                ? item.copyWith(isRead: true)
                : item,
        ],
        unreadCount: homeId == null
            ? 0
            : (current.unreadCount - affected.length).clamp(0, 1 << 30),
      ),
    );
    for (final n in affected) {
      _adjustOverview(n, -1);
    }
    try {
      await ref
          .read(notificationRepositoryProvider)
          .markAllRead(homeId: homeId);
    } on Object {
      if (ref.mounted) state = AsyncData(current);
      for (final n in affected) {
        _adjustOverview(n, 1);
      }
      rethrow;
    }
  }

  /// WebSocket `notification` event: prepend and bump the badge.
  void onRealtime(AppNotification notification) {
    final current = state.value;
    if (current == null) {
      ref.invalidateSelf();
      return;
    }
    if (current.items.any((n) => n.id == notification.id)) return;
    state = AsyncData(
      current.copyWith(
        items: [notification, ...current.items],
        unreadCount: current.unreadCount + (notification.isRead ? 0 : 1),
      ),
    );
    if (!notification.isRead) _adjustOverview(notification, 1);
  }
}

final notificationsProvider =
    AsyncNotifierProvider<NotificationsNotifier, NotificationsState>(
      NotificationsNotifier.new,
    );

/// Badge on the bottom navigation bar.
final unreadCountProvider = Provider<int>(
  (ref) => ref.watch(notificationsProvider).value?.unreadCount ?? 0,
);
