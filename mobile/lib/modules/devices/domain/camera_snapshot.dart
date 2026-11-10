import 'package:flutter/foundation.dart';

/// Why the camera took the picture (contract: `motion` | `request`).
enum SnapshotTrigger {
  motion('motion', 'Chuyển động'),
  request('request', 'Theo yêu cầu');

  const SnapshotTrigger(this.apiValue, this.label);

  final String apiValue;

  /// Vietnamese label shown under the picture.
  final String label;

  static SnapshotTrigger fromApi(String? value) {
    for (final trigger in values) {
      if (trigger.apiValue == value) return trigger;
    }
    return SnapshotTrigger.request;
  }
}

/// Metadata of one camera picture (`GET /devices/:id/snapshots` item). The
/// JPEG itself is fetched separately with the Bearer token.
@immutable
class CameraSnapshot {
  const CameraSnapshot({
    required this.id,
    required this.trigger,
    required this.sizeBytes,
    required this.capturedAt,
  });

  final int id;
  final SnapshotTrigger trigger;
  final int sizeBytes;
  final DateTime capturedAt;

  /// Newest first (the list order the server returns).
  static int newestFirst(CameraSnapshot a, CameraSnapshot b) =>
      b.capturedAt.compareTo(a.capturedAt);
}

/// "26/11/2026 15:04" — capture time in Vietnam time (UTC+7) regardless of the
/// phone's zone, so it matches what the household sees on the door.
String formatSnapshotTime(DateTime value) {
  final vn = value.toUtc().add(const Duration(hours: 7));
  String two(int n) => n.toString().padLeft(2, '0');
  return '${two(vn.hour)}:${two(vn.minute)} ${two(vn.day)}/${two(vn.month)}/${vn.year}';
}
