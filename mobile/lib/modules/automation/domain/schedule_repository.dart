import 'schedule.dart';
import 'schedule_input.dart';

/// One-off schedules (FR-5.10, contract §2).
abstract class ScheduleRepository {
  /// `GET /homes/:id/schedules?scope=&limit=`. A GUEST only sees own schedules.
  Future<List<Schedule>> list(int homeId, ScheduleScope scope, {int? limit});

  /// `POST /homes/:id/schedules` → the created schedule.
  Future<Schedule> create(int homeId, ScheduleInput input);

  /// `POST /schedules/:id/cancel`; only while `scheduled`, by the creator or the
  /// owner.
  Future<Schedule> cancel(int scheduleId);
}
