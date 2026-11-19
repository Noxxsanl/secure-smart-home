import 'dart:async';

import '../core/realtime/realtime_source.dart';
import '../modules/homes/homes.dart';
import 'mock_backend.dart';

/// Realtime for the mock mode: forwards the [MockBackend] pushes (device state
/// after a command, membership changes) and simulates a sensor network —
/// telemetry every [tickInterval] and one "camera motion" alert after
/// [motionEventDelay] so the notification path is visible without a server.
class MockRealtimeSource implements RealtimeSource {
  MockRealtimeSource(
    this._backend, {
    this.tickInterval = const Duration(seconds: 12),
    this.motionEventDelay = const Duration(seconds: 25),
  });

  final MockBackend _backend;
  final Duration tickInterval;
  final Duration motionEventDelay;

  final _messages = StreamController<RealtimeMessage>.broadcast();
  final _statuses = StreamController<RealtimeStatus>.broadcast();
  RealtimeStatus _status = RealtimeStatus.disconnected;
  StreamSubscription<MockEvent>? _subscription;
  Timer? _tick;
  Timer? _motion;

  @override
  Stream<RealtimeMessage> get messages => _messages.stream;

  @override
  Stream<RealtimeStatus> get statuses => _statuses.stream;

  @override
  RealtimeStatus get status => _status;

  void _setStatus(RealtimeStatus next) {
    if (_status == next) return;
    _status = next;
    if (!_statuses.isClosed) _statuses.add(next);
  }

  @override
  Future<void> start() async {
    if (_subscription != null) return;
    _subscription = _backend.events.listen(_forward);
    _tick = Timer.periodic(tickInterval, (_) => _backend.simulateTick());
    _motion = Timer(motionEventDelay, _simulateMotion);
    _setStatus(RealtimeStatus.connected);
  }

  void _simulateMotion() {
    final userId = _backend.currentUserId;
    if (userId == null) return;
    for (final m in _backend.memberships) {
      if (m.userId != userId || m.role == HomeRole.guest) continue;
      if (_backend.membershipFor(userId, m.homeId) == null) continue;
      if (!_backend.homeRecord(m.homeId).gatewayOnline) continue;
      _backend.simulateCameraMotion(m.homeId);
      return;
    }
  }

  void _forward(MockEvent event) {
    final userId = _backend.currentUserId;
    if (userId == null) return;
    if (event.userId != null && event.userId != userId) return;
    final homeId = event.homeId;
    if (homeId != null) {
      final membership = _backend.membershipFor(userId, homeId);
      if (membership == null) return;
      if (membership.role == HomeRole.guest) {
        final data = event.message.data;
        final device = data['device'];
        final deviceId = device is Map ? device['id'] : data['device_id'];
        if (deviceId is int && !membership.guestDeviceIds.contains(deviceId)) {
          return;
        }
      }
    }
    if (!_messages.isClosed) _messages.add(event.message);
  }

  @override
  Future<void> stop() async {
    _tick?.cancel();
    _motion?.cancel();
    _tick = null;
    _motion = null;
    final subscription = _subscription;
    _subscription = null;
    await subscription?.cancel();
    _setStatus(RealtimeStatus.disconnected);
  }

  @override
  Future<void> dispose() async {
    await stop();
    await _messages.close();
    await _statuses.close();
  }
}
