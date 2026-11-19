/// Public API of the notifications module (notification list, unread count)
/// for other modules. Pages: notifications_module.dart (only lib/app/ imports
/// it).
library;

export 'application/notification_providers.dart';
// Contract mapper: realtime `notification` events embed a notification.
export 'data/notification_mapper.dart';
export 'domain/app_notification.dart';
export 'domain/notification_repository.dart';
