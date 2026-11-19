import 'app_notification.dart';

/// Notification centre under `/api/mobile/notifications/**` (FR-8.2).
abstract class NotificationRepository {
  /// `GET /notifications?home_id=&limit=50` (only rows addressed to me).
  Future<NotificationsPage> list({int? homeId, int limit = 50});

  /// `PATCH /notifications/:id/read`.
  Future<void> markRead(int id);

  /// `PATCH /notifications/read-all { home_id? }`.
  Future<void> markAllRead({int? homeId});
}
