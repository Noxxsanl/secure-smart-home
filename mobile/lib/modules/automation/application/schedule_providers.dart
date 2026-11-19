import 'dart:async';

import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/config/app_config.dart';
import '../../../core/network/network_providers.dart';
import '../../../mock/mock_providers.dart';
import '../../auth/auth.dart';
import '../data/schedule_mock_repository.dart';
import '../data/schedule_remote_repository.dart';
import '../domain/schedule.dart';
import '../domain/schedule_input.dart';
import '../domain/schedule_repository.dart';

/// Remote or mock by `AppConfig.useMock`; the mock keeps its schedules in
/// memory for the whole session.
final scheduleRepositoryProvider = Provider<ScheduleRepository>((ref) {
  final config = ref.watch(appConfigProvider);
  if (config.useMock) {
    return MockScheduleRepository(ref.watch(mockBackendProvider));
  }
  return RemoteScheduleRepository(ref.watch(apiClientProvider));
});

/// One list: the schedules of [homeId] in [scope].
typedef ScheduleQuery = ({int homeId, ScheduleScope scope});

/// How often a list that is on screen reloads itself (the worker runs a
/// schedule within 5 s of its time; the web polls the same way).
const upcomingSchedulesPollInterval = Duration(seconds: 10);
const historySchedulesPollInterval = Duration(seconds: 30);

/// Schedules of one home. Auto-disposed, so the polling timer only exists
/// while a screen listens; a reload keeps the old list on screen.
final schedulesProvider = FutureProvider.autoDispose
    .family<List<Schedule>, ScheduleQuery>((ref, query) {
      ref.watch(sessionUserIdProvider);
      final interval = query.scope == ScheduleScope.upcoming
          ? upcomingSchedulesPollInterval
          : historySchedulesPollInterval;
      final timer = Timer.periodic(interval, (_) {
        if (ref.mounted) ref.invalidateSelf();
      });
      ref.onDispose(timer.cancel);
      return ref
          .watch(scheduleRepositoryProvider)
          .list(query.homeId, query.scope, limit: query.scope.defaultLimit);
    });

/// Reloads both lists of [homeId] (after create/cancel, or a realtime
/// notification about a schedule). Lists nobody listens to are simply dropped.
void invalidateSchedules(Ref ref, int homeId) {
  for (final scope in ScheduleScope.values) {
    ref.invalidate(schedulesProvider((homeId: homeId, scope: scope)));
  }
}

/// Creates / cancels schedules, then refreshes the lists.
class ScheduleActions {
  ScheduleActions(this._ref);

  final Ref _ref;

  Future<Schedule> create(int homeId, ScheduleInput input) async {
    final schedule = await _ref
        .read(scheduleRepositoryProvider)
        .create(homeId, input);
    if (_ref.mounted) invalidateSchedules(_ref, homeId);
    return schedule;
  }

  Future<void> cancel(int homeId, int scheduleId) async {
    try {
      await _ref.read(scheduleRepositoryProvider).cancel(scheduleId);
    } finally {
      // Also on 404/409: the schedule just ran or was cancelled elsewhere, so
      // the list on screen is stale.
      if (_ref.mounted) invalidateSchedules(_ref, homeId);
    }
  }

  /// Pull-to-refresh / retry.
  void refresh(int homeId) => invalidateSchedules(_ref, homeId);
}

final scheduleActionsProvider = Provider<ScheduleActions>(ScheduleActions.new);
