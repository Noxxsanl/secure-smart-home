import '../../../core/network/api_client.dart';
import '../../../core/utils/json.dart';
import '../domain/schedule.dart';
import '../domain/schedule_input.dart';
import '../domain/schedule_repository.dart';
import 'schedule_mapper.dart';

/// One-off schedules over `/api/mobile` (contract §2).
class RemoteScheduleRepository implements ScheduleRepository {
  RemoteScheduleRepository(this._api);

  final ApiClient _api;

  @override
  Future<List<Schedule>> list(
    int homeId,
    ScheduleScope scope, {
    int? limit,
  }) async {
    final data = await _api.get(
      '/homes/$homeId/schedules',
      query: {'scope': scope.apiValue, 'limit': limit ?? scope.defaultLimit},
    );
    return scheduleListFromJson(data);
  }

  @override
  Future<Schedule> create(int homeId, ScheduleInput input) async {
    final data = await _api.post(
      '/homes/$homeId/schedules',
      body: input.toJson(),
    );
    return scheduleFromJson(asJson(data));
  }

  @override
  Future<Schedule> cancel(int scheduleId) async {
    final data = await _api.post('/schedules/$scheduleId/cancel');
    return scheduleFromJson(asJson(data));
  }
}
