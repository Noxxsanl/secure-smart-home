import 'package:flutter/foundation.dart';

enum Severity {
  critical('critical', 'Nghiêm trọng'),
  warning('warning', 'Cảnh báo'),
  info('info', 'Thông tin'),
  success('success', 'Thành công');

  const Severity(this.apiValue, this.label);

  final String apiValue;
  final String label;

  static Severity fromApi(String? value) {
    for (final severity in values) {
      if (severity.apiValue == value) return severity;
    }
    return Severity.info;
  }

  /// Counts toward the "open alerts" figure on the Home screen.
  bool get isAlert => this == critical || this == warning;
}

/// Contract §3 `CustomerNotification`.
@immutable
class AppNotification {
  const AppNotification({
    required this.id,
    required this.type,
    required this.title,
    required this.message,
    required this.severity,
    required this.isRead,
    required this.createdAt,
    this.homeId,
    this.homeName,
  });

  final int id;
  final int? homeId;
  final String? homeName;
  final String type;
  final String title;
  final String message;
  final Severity severity;
  final bool isRead;
  final DateTime createdAt;

  AppNotification copyWith({bool? isRead}) => AppNotification(
    id: id,
    homeId: homeId,
    homeName: homeName,
    type: type,
    title: title,
    message: message,
    severity: severity,
    isRead: isRead ?? this.isRead,
    createdAt: createdAt,
  );
}

/// `GET /notifications` response.
@immutable
class NotificationsPage {
  const NotificationsPage({required this.items, required this.unreadCount});

  final List<AppNotification> items;
  final int unreadCount;
}
