import '../../../core/network/api_exception.dart';
import '../../../core/utils/home_time.dart';
import '../../../mock/mock_backend.dart';
import '../../devices/devices.dart';
import '../../homes/homes.dart';
import '../domain/schedule.dart';
import '../domain/schedule_input.dart';
import '../domain/schedule_repository.dart';

/// One-off schedules kept in memory (one instance per session), behaving like
/// the real backend (contract §2): GUEST only sees own schedules, the device
/// must belong to the home and be schedulable, 50 pending per home, `run_at`
/// computed on the home's clock, cancel only while `scheduled`. A schedule that
/// reaches its time while the list is read is run through
/// [MockBackend.sendCommand], so the device really changes in the mock.
class MockScheduleRepository implements ScheduleRepository {
  MockScheduleRepository(this._backend) {
    _seed();
  }

  final MockBackend _backend;
  final _items = <Schedule>[];

  /// Pending schedules a home may hold.
  static const maxPending = 50;

  ApiException _error(String code, int status) =>
      ApiException(code: code, statusCode: status);

  @override
  Future<List<Schedule>> list(int homeId, ScheduleScope scope, {int? limit}) {
    return _backend.respond(() {
      final membership = _backend.requireMembership(homeId);
      _runDue(homeId);
      final mine = [
        for (final s in _items)
          if (s.homeId == homeId &&
              (membership.role != HomeRole.guest ||
                  s.createdByUserId == _backend.meId))
            _view(s, membership),
      ];
      final List<Schedule> result;
      if (scope == ScheduleScope.upcoming) {
        result = mine.where((s) => s.status.isUpcoming).toList()
          ..sort((a, b) => a.runAt.compareTo(b.runAt));
      } else {
        DateTime endedAt(Schedule s) =>
            s.executedAt ?? s.cancelledAt ?? s.runAt;
        result = mine.where((s) => !s.status.isUpcoming).toList()
          ..sort((a, b) => endedAt(b).compareTo(endedAt(a)));
      }
      return result.take(limit ?? scope.defaultLimit).toList();
    });
  }

  @override
  Future<Schedule> create(int homeId, ScheduleInput input) {
    return _backend.respond(() {
      final membership = _backend.requireMembership(homeId);
      final device = _backend
          .visibleDevices(homeId, membership)
          .where((d) => d.id == input.deviceId)
          .firstOrNull;
      if (device == null) _backend.notFound();
      // Sensors, cameras… are not something a schedule can drive.
      if (!device.isRelay) throw _error(ApiErrorCode.notControllable, 400);
      if (!device.canControl) _backend.forbidden();
      _backend.requireWritable(homeId);
      final kind = device.appliance;
      if (kind == null ||
          !scheduleChoicesFor(kind).any((c) => c.action == input.action)) {
        throw _error(ApiErrorCode.notControllable, 400);
      }
      final temperature = input.temperature;
      final position = input.position;
      if (input.action == ScheduleAction.setTemp &&
          (temperature == null ||
              temperature < scheduleTempMin ||
              temperature > scheduleTempMax)) {
        _backend.invalidInput();
      }
      if (input.action == ScheduleAction.setPos &&
          (position == null || position < 0 || position > 100)) {
        _backend.invalidInput();
      }

      final home = _backend.homeRecord(homeId).home;
      final clock = HomeClock(home.timezone);
      final now = _backend.now;
      final when = input.when;
      switch (when) {
        case ScheduleAfter(:final minutes):
          if (minutes < scheduleAfterMin || minutes > scheduleAfterMax) {
            _backend.invalidInput();
          }
        case ScheduleAt(:final time, :final date):
          if (!isValidScheduleTime(time) ||
              (date != null && !isValidScheduleDate(date))) {
            _backend.invalidInput();
          }
      }
      final runAt = resolveRunAt(when, clock, now);
      final ahead = runAt.difference(now);
      if (ahead < scheduleMinAhead || ahead > scheduleMaxAhead) {
        throw _error('INVALID_WHEN', 400);
      }
      final pending = _items
          .where(
            (s) => s.homeId == homeId && s.status == ScheduleStatus.scheduled,
          )
          .length;
      if (pending >= maxPending) throw _error('SCHEDULE_LIMIT', 409);

      final schedule = Schedule(
        id: _backend.nextId('schedule'),
        homeId: homeId,
        timezone: clock.timezone,
        deviceId: device.id,
        deviceName: device.name,
        roomName: device.roomName,
        appliance: kind,
        action: input.action,
        temperature: input.action == ScheduleAction.setTemp
            ? temperature
            : null,
        position: input.action == ScheduleAction.setPos ? position : null,
        actionLabel: mockActionLabel(
          kind,
          input.action,
          temperature: temperature,
          position: position,
        ),
        runAt: runAt,
        status: ScheduleStatus.scheduled,
        origin: ScheduleOrigin.user,
        channel: 'mobile',
        createdByUserId: _backend.meId,
        createdByName: _backend.me.fullName,
        createdAt: now,
        canCancel: true,
      );
      _items.add(schedule);
      return _view(schedule, membership);
    });
  }

  @override
  Future<Schedule> cancel(int scheduleId) {
    return _backend.respond(() {
      final index = _items.indexWhere((s) => s.id == scheduleId);
      if (index < 0) _backend.notFound();
      final found = _items[index];
      final membership = _backend.requireMembership(found.homeId);
      if (membership.role == HomeRole.guest &&
          found.createdByUserId != _backend.meId) {
        _backend.notFound();
      }
      _runDue(found.homeId);
      final current = _items[index];
      if (current.status != ScheduleStatus.scheduled) {
        throw _error('SCHEDULE_NOT_CANCELLABLE', 409);
      }
      if (membership.role != HomeRole.owner &&
          current.createdByUserId != _backend.meId) {
        _backend.forbidden();
      }
      final cancelled = current.copyWith(
        status: ScheduleStatus.cancelled,
        cancelledAt: _backend.now,
        canCancel: false,
      );
      _items[index] = cancelled;
      return _view(cancelled, membership);
    });
  }

  /// `can_cancel` as the backend computes it for the caller.
  Schedule _view(Schedule s, MockMembership membership) => s.copyWith(
    canCancel:
        s.status == ScheduleStatus.scheduled &&
        (membership.role == HomeRole.owner ||
            (membership.role != HomeRole.viewer &&
                s.createdByUserId == _backend.meId)),
  );

  /// Runs what reached its time (the real worker polls every 5 s). Errors become
  /// the schedule's `error_code`.
  void _runDue(int homeId) {
    final now = _backend.now;
    for (var i = 0; i < _items.length; i++) {
      final s = _items[i];
      if (s.homeId != homeId ||
          s.status != ScheduleStatus.scheduled ||
          s.runAt.isAfter(now)) {
        continue;
      }
      _items[i] = _run(s, now);
    }
  }

  Schedule _run(Schedule s, DateTime now) {
    CustomerDevice? device;
    for (final d in _backend.devices) {
      if (d.id == s.deviceId) device = d;
    }
    if (device == null) {
      return s.copyWith(
        status: ScheduleStatus.failed,
        errorCode: 'NO_DEVICE',
        executedAt: now,
        canCancel: false,
      );
    }
    final isPowerAction =
        s.action == ScheduleAction.turnOn || s.action == ScheduleAction.turnOff;
    // Only a reachable device can tell it is already in the wanted state.
    if (isPowerAction &&
        device.online &&
        s.appliance != ApplianceKind.curtain &&
        device.power == (s.action == ScheduleAction.turnOn)) {
      return s.copyWith(
        status: ScheduleStatus.skipped,
        errorCode: 'ALREADY_IN_STATE',
        executedAt: now,
        canCancel: false,
      );
    }
    final command = switch (s.action) {
      ScheduleAction.turnOn => const DeviceCommand.turnOn(),
      ScheduleAction.turnOff => const DeviceCommand.turnOff(),
      ScheduleAction.setPos => DeviceCommand.setPosition(s.position ?? 0),
      ScheduleAction.setTemp => DeviceCommand.setTemperature(
        s.temperature ?? scheduleTempDefault,
      ),
      ScheduleAction.unknown => null,
    };
    if (command == null) {
      return s.copyWith(
        status: ScheduleStatus.failed,
        errorCode: 'NOT_CONTROLLABLE',
        executedAt: now,
        canCancel: false,
      );
    }
    try {
      _backend.sendCommand(device.id, command);
      return s.copyWith(
        status: ScheduleStatus.done,
        executedAt: now,
        canCancel: false,
      );
    } on ApiException catch (error) {
      return s.copyWith(
        status: ScheduleStatus.failed,
        errorCode: _failureCode(error.code),
        executedAt: now,
        canCancel: false,
      );
    }
  }

  static String _failureCode(String code) => switch (code) {
    ApiErrorCode.deviceOffline => 'DEVICE_OFFLINE',
    ApiErrorCode.deviceBlocked => 'DEVICE_BLOCKED',
    ApiErrorCode.homeSuspended => 'HOME_SUSPENDED',
    ApiErrorCode.notControllable => 'NOT_CONTROLLABLE',
    ApiErrorCode.timeout => 'TIMEOUT',
    ApiErrorCode.forbidden => 'ACCESS_REVOKED',
    ApiErrorCode.notFound => 'NO_DEVICE',
    _ => 'COMMAND_FAILED',
  };

  /// Two upcoming schedules and one finished (by the assistant) for
  /// "Nhà của Nguyễn Hoàng Đạt", so the screen is not empty on first run.
  void _seed() {
    final record = _backend.homes
        .where((h) => h.home.name == 'Nhà của Nguyễn Hoàng Đạt')
        .firstOrNull;
    if (record == null) return;
    final homeId = record.home.id;
    final now = _backend.now;
    CustomerDevice? find(String name) => _backend.devices
        .where((d) => d.homeId == homeId && d.name == name)
        .firstOrNull;

    void add(
      String deviceName,
      ScheduleAction action, {
      required Duration after,
      required ScheduleStatus status,
      ScheduleOrigin origin = ScheduleOrigin.user,
      String? errorCode,
    }) {
      final device = find(deviceName);
      final kind = device?.appliance;
      if (device == null || kind == null) return;
      final runAt = now.add(after);
      _items.add(
        Schedule(
          id: _backend.nextId('schedule'),
          homeId: homeId,
          timezone: record.home.timezone,
          deviceId: device.id,
          deviceName: device.name,
          roomName: device.roomName,
          appliance: kind,
          action: action,
          actionLabel: mockActionLabel(kind, action),
          runAt: runAt,
          status: status,
          origin: origin,
          channel: origin == ScheduleOrigin.aiAgent ? 'web' : 'mobile',
          createdByUserId: 7,
          createdByName: 'Nguyễn Hoàng Đạt',
          errorCode: errorCode,
          executedAt: status == ScheduleStatus.scheduled ? null : runAt,
          createdAt: now.subtract(const Duration(hours: 3)),
          canCancel: status == ScheduleStatus.scheduled,
        ),
      );
    }

    add(
      'Đèn phòng khách',
      ScheduleAction.turnOff,
      after: const Duration(hours: 2),
      status: ScheduleStatus.scheduled,
    );
    add(
      'Quạt phòng khách',
      ScheduleAction.turnOn,
      after: const Duration(hours: 5, minutes: 10),
      status: ScheduleStatus.scheduled,
    );
    add(
      'Rèm cửa phòng khách',
      ScheduleAction.turnOn,
      after: const Duration(hours: -2),
      status: ScheduleStatus.done,
      origin: ScheduleOrigin.aiAgent,
    );
  }
}

/// `action_label` the backend builds: "Bật đèn", "Mở rèm 50%", "Đặt điều
/// hoà 26°C" (no room name).
String mockActionLabel(
  ApplianceKind kind,
  ScheduleAction action, {
  int? temperature,
  int? position,
}) {
  final noun = switch (kind) {
    ApplianceKind.lamp => 'đèn',
    ApplianceKind.fan => 'quạt',
    ApplianceKind.curtain => 'rèm',
    ApplianceKind.airConditioner => 'điều hoà',
    ApplianceKind.plainSwitch => 'thiết bị',
  };
  final curtain = kind == ApplianceKind.curtain;
  return switch (action) {
    ScheduleAction.turnOn => curtain ? 'Mở rèm' : 'Bật $noun',
    ScheduleAction.turnOff => curtain ? 'Đóng rèm' : 'Tắt $noun',
    ScheduleAction.setPos =>
      position == 0
          ? 'Đóng rèm'
          : (position == null || position >= 100
                ? 'Mở rèm'
                : 'Mở rèm $position%'),
    ScheduleAction.setTemp =>
      'Đặt điều hoà ${temperature ?? scheduleTempDefault}°C',
    ScheduleAction.unknown => 'Hẹn giờ $noun',
  };
}
