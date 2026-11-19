import '../../../core/network/api_client.dart';
import '../../../core/utils/json.dart';
import '../domain/app_notification.dart';
import '../domain/notification_repository.dart';
import 'notification_mapper.dart';

/// `/api/mobile/notifications/**` (contract §4.2).
class RemoteNotificationRepository implements NotificationRepository {
  RemoteNotificationRepository(this._api);

  final ApiClient _api;

  @override
  Future<NotificationsPage> list({int? homeId, int limit = 50}) async {
    final data = await _api.get(
      '/notifications',
      query: {'home_id': homeId, 'limit': limit},
    );
    return notificationsPageFromJson(asJson(data));
  }

  @override
  Future<void> markRead(int id) async {
    await _api.patch('/notifications/$id/read');
  }

  @override
  Future<void> markAllRead({int? homeId}) async {
    await _api.patch(
      '/notifications/read-all',
      body: {'home_id': ?homeId},
    );
  }
}
