import '../../../core/utils/json.dart';
import '../domain/app_notification.dart';

/// Contract §3 `CustomerNotification`.
AppNotification notificationFromJson(Json json) => AppNotification(
  id: json.readInt('id'),
  homeId: json.readIntOrNull('home_id'),
  homeName: json.readStringOrNull('home_name'),
  type: json.readString('type'),
  title: json.readString('title', fallback: 'Thông báo'),
  message: json.readString('message'),
  severity: Severity.fromApi(json.readStringOrNull('severity')),
  isRead: json.readBool('is_read'),
  createdAt: json.readDateOrNull('created_at') ?? DateTime.now(),
);

/// `GET /notifications` response: `{ notifications, unread_count }`.
NotificationsPage notificationsPageFromJson(Json json) {
  final items = json.readObjectList('notifications').map(notificationFromJson);
  return NotificationsPage(
    items: items.toList(),
    unreadCount: json.readIntOrNull('unread_count') ?? 0,
  );
}
