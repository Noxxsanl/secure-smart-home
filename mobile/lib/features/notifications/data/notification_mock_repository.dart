import '../../../mock/mock_backend.dart';
import '../domain/app_notification.dart';
import '../domain/notification_repository.dart';

class MockNotificationRepository implements NotificationRepository {
  MockNotificationRepository(this._backend);

  final MockBackend _backend;

  @override
  Future<NotificationsPage> list({int? homeId, int limit = 50}) {
    return _backend.respond(() {
      final mine = _backend.notifications
          .where(
            (row) =>
                row.userId == _backend.meId &&
                (homeId == null || row.notification.homeId == homeId),
          )
          .map((row) => row.notification)
          .toList()
        ..sort((a, b) => b.createdAt.compareTo(a.createdAt));
      return NotificationsPage(
        items: mine.take(limit).toList(),
        unreadCount: mine.where((n) => !n.isRead).length,
      );
    });
  }

  @override
  Future<void> markRead(int id) {
    return _backend.respond(() {
      final matches = _backend.notifications.where(
        (row) => row.userId == _backend.meId && row.notification.id == id,
      );
      if (matches.isEmpty) _backend.notFound();
      for (final row in matches) {
        row.notification = row.notification.copyWith(isRead: true);
      }
    });
  }

  @override
  Future<void> markAllRead({int? homeId}) {
    return _backend.respond(() {
      for (final row in _backend.notifications) {
        if (row.userId != _backend.meId) continue;
        if (homeId != null && row.notification.homeId != homeId) continue;
        row.notification = row.notification.copyWith(isRead: true);
      }
    });
  }
}
