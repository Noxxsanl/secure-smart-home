import 'dart:async';
import 'dart:math' as math;

import '../core/network/api_exception.dart';
import '../core/realtime/realtime_source.dart';
import '../modules/auth/auth.dart';
import '../modules/automation/automation.dart';
import '../modules/devices/devices.dart';
import '../modules/homes/homes.dart';
import '../modules/notifications/notifications.dart';

/// Demo account (contract §8) plus the staff accounts that must be refused.
class MockAccount {
  MockAccount({
    required this.id,
    required this.customerId,
    required this.email,
    required this.password,
    required this.fullName,
    required this.userTag,
    required this.joinedAt,
    this.phone,
    this.address,
    this.role = 'user',
  });

  final int id;
  final int customerId;
  final String email;
  String password;
  String fullName;
  String? phone;
  String? address;
  final String userTag;
  final DateTime joinedAt;
  final String role;

  MeUser toMeUser() => MeUser(
    id: id,
    role: role,
    username: email,
    email: email,
    displayName: fullName,
    customerId: role == 'user' ? customerId : null,
    userTag: role == 'user' ? userTag : null,
  );
}

/// `smart_home_members` row (pending invite when [userId] is null).
class MockMembership {
  MockMembership({
    required this.id,
    required this.homeId,
    required this.role,
    required this.displayName,
    required this.createdAt,
    this.userId,
    this.inviteEmail,
    this.inviteExpiresAt,
    this.invitedBy,
    this.expiresAt,
    this.acceptedAt,
    Set<int>? guestDeviceIds,
  }) : guestDeviceIds = guestDeviceIds ?? <int>{};

  final int id;
  final int homeId;
  int? userId;
  HomeRole role;
  String displayName;
  String? inviteEmail;
  DateTime? inviteExpiresAt;
  int? invitedBy;
  DateTime? expiresAt;
  DateTime? acceptedAt;
  final DateTime createdAt;
  Set<int> guestDeviceIds;

  bool get isPending => userId == null && inviteEmail != null;
}

class MockHomeRecord {
  MockHomeRecord({
    required this.home,
    required this.gatewayUid,
    required this.gatewayOnline,
    this.gatewayLastSeen,
  });

  Home home;
  final String gatewayUid;
  bool gatewayOnline;
  DateTime? gatewayLastSeen;
}

class MockActivationCode {
  MockActivationCode({
    required this.code,
    required this.homeId,
    required this.expiresAt,
    this.usedByUserId,
  });

  final String code;
  final int homeId;
  final DateTime expiresAt;
  int? usedByUserId;
}

class MockNotificationRow {
  MockNotificationRow({required this.userId, required this.notification});

  final int userId;
  AppNotification notification;
}

/// A server push produced by the mock (consumed by `MockRealtimeSource`).
class MockEvent {
  const MockEvent({required this.message, this.homeId, this.userId});

  final RealtimeMessage message;
  final int? homeId;

  /// When set, only this user receives the event.
  final int? userId;
}

ApiException _error(String code, int status, {int? retryAfterSeconds}) =>
    ApiException(
      code: code,
      statusCode: status,
      retryAfterSeconds: retryAfterSeconds,
    );

/// An in-memory stand-in for the backend, seeded from contract §8 and
/// enforcing the permission matrix of contract §4.1 (404 outside the home,
/// 403 for a too-low role). Every mock repository is a thin adapter over it,
/// so the app runs without a server (`--dart-define=USE_MOCK=true`).
class MockBackend {
  MockBackend({this.latency = Duration.zero, DateTime Function()? clock})
    : clock = clock ?? DateTime.now {
    _seed();
  }

  /// Artificial delay applied to every call (0 in tests).
  Duration latency;
  final DateTime Function() clock;
  DateTime get now => clock();

  final accounts = <MockAccount>[];
  int? currentUserId;
  final homes = <MockHomeRecord>[];
  final memberships = <MockMembership>[];
  final rooms = <RoomSummary>[];
  final devices = <CustomerDevice>[];
  final notifications = <MockNotificationRow>[];
  final rules = <AutomationRule>[];
  final ruleRuns = <int, List<RuleRun>>{};
  final suggestions = <HabitSuggestion>[];
  final codes = <MockActivationCode>[];

  final _climateBase = <int, ({double temperature, double humidity})>{};
  final _failedClaims = <int, List<DateTime>>{};
  final _ids = <String, int>{};
  final _random = math.Random(7);
  final _events = StreamController<MockEvent>.broadcast();

  Stream<MockEvent> get events => _events.stream;

  int nextId(String kind) => _ids.update(kind, (v) => v + 1, ifAbsent: () => 1);

  /// Runs [action] after the artificial [latency]; errors surface as failed
  /// futures exactly like a failing HTTP call.
  Future<T> respond<T>(T Function() action) async {
    if (latency > Duration.zero) await Future<void>.delayed(latency);
    return action();
  }

  // ----------------------------------------------------------------- session

  int get meId {
    final id = currentUserId;
    if (id == null) throw _error(ApiErrorCode.noToken, 401);
    return id;
  }

  MockAccount get me => accounts.firstWhere((a) => a.id == meId);

  MockAccount? accountById(int? id) {
    for (final account in accounts) {
      if (account.id == id) return account;
    }
    return null;
  }

  MockAccount? accountByEmail(String email) {
    final normalized = email.trim().toLowerCase();
    for (final account in accounts) {
      if (account.email == normalized) return account;
    }
    return null;
  }

  // ------------------------------------------------------------- membership

  bool _isEffective(MockMembership m) =>
      m.userId != null && (m.expiresAt == null || m.expiresAt!.isAfter(now));

  MockMembership? membershipFor(int userId, int homeId) {
    for (final m in memberships) {
      if (m.homeId == homeId && m.userId == userId && _isEffective(m)) return m;
    }
    return null;
  }

  /// Tenant rule (invariant 6): not a member (or expired GUEST) → 404.
  MockMembership requireMembership(int homeId) {
    final m = membershipFor(meId, homeId);
    if (m == null) throw _error(ApiErrorCode.notFound, 404);
    return m;
  }

  MockHomeRecord homeRecord(int homeId) {
    for (final record in homes) {
      if (record.home.id == homeId) return record;
    }
    throw _error(ApiErrorCode.notFound, 404);
  }

  Never forbidden() => throw _error(ApiErrorCode.forbidden, 403);
  Never notFound() => throw _error(ApiErrorCode.notFound, 404);
  Never invalidInput() => throw _error(ApiErrorCode.invalidInput, 400);

  void requireWritable(int homeId) {
    if (homeRecord(homeId).home.isSuspended) {
      throw _error(ApiErrorCode.homeSuspended, 409);
    }
  }

  List<MyHome> myHomes() {
    final result = <MyHome>[];
    for (final m in memberships) {
      if (m.userId != meId || !_isEffective(m)) continue;
      final record = homeRecord(m.homeId);
      final visible = visibleDevices(m.homeId, m);
      result.add(
        MyHome(
          home: record.home,
          role: m.role,
          deviceCount: visible.length,
          onlineCount: visible.where((d) => d.online).length,
          expiresAt: m.expiresAt,
        ),
      );
    }
    result.sort((a, b) => a.id.compareTo(b.id));
    return result;
  }

  // ---------------------------------------------------------------- devices

  bool _guestAllowed(MockMembership m, CustomerDevice d) =>
      m.role != HomeRole.guest || m.guestDeviceIds.contains(d.id);

  CustomerDevice deviceView(CustomerDevice d, MockMembership m) => d.copyWith(
    canControl: d.isRelay && m.role != HomeRole.viewer && _guestAllowed(m, d),
  );

  List<CustomerDevice> visibleDevices(int homeId, MockMembership m) => [
    for (final d in devices)
      if (d.homeId == homeId &&
          d.category != DeviceCategory.gateway &&
          _guestAllowed(m, d))
        deviceView(d, m),
  ];

  /// `GET /devices/:id` access rule: unknown or hidden → 404.
  ({CustomerDevice device, MockMembership membership}) requireDevice(int id) {
    for (final d in devices) {
      if (d.id != id || d.category == DeviceCategory.gateway) continue;
      final m = membershipFor(meId, d.homeId);
      if (m == null || !_guestAllowed(m, d)) notFound();
      return (device: deviceView(d, m), membership: m);
    }
    notFound();
  }

  void _replaceDevice(CustomerDevice next) {
    final index = devices.indexWhere((d) => d.id == next.id);
    if (index >= 0) devices[index] = next;
  }

  RoomSummary roomView(RoomSummary base, MockMembership m) {
    final inRoom = visibleDevices(
      base.homeId,
      m,
    ).where((d) => d.roomId == base.id).toList();
    CustomerDevice? sensor;
    for (final d in inRoom) {
      if (d.isSensor && d.latest?.temperature != null) {
        sensor = d;
        break;
      }
    }
    return RoomSummary(
      id: base.id,
      homeId: base.homeId,
      name: base.name,
      roomType: base.roomType,
      sortOrder: base.sortOrder,
      temperature: sensor?.latest?.temperature,
      humidity: sensor?.latest?.humidity,
      hasClimateData: sensor != null,
      climateUpdatedAt: sensor?.latest?.receivedAt,
      deviceCount: inRoom.length,
      onlineCount: inRoom.where((d) => d.online).length,
      onCount: inRoom.where((d) => d.isRelay && d.isOn).length,
    );
  }

  RoomSummary requireRoom(int roomId) {
    for (final room in rooms) {
      if (room.id == roomId) return room;
    }
    notFound();
  }

  HomeOverview overviewFor(int homeId) {
    final m = requireMembership(homeId);
    final record = homeRecord(homeId);
    final mine = notifications
        .where(
          (row) =>
              row.userId == meId &&
              row.notification.homeId == homeId &&
              !row.notification.isRead,
        )
        .toList();
    return HomeOverview(
      home: record.home,
      role: m.role,
      gateway: GatewayInfo(
        id: record.home.gatewayId ?? 0,
        uid: record.gatewayUid,
        online: record.gatewayOnline,
        lastSeen: record.gatewayLastSeen,
      ),
      rooms: [
        for (final room in rooms.where((r) => r.homeId == homeId))
          roomView(room, m),
      ]..sort((a, b) => a.sortOrder.compareTo(b.sortOrder)),
      devices: visibleDevices(homeId, m),
      openAlerts: mine.where((row) => row.notification.severity.isAlert).length,
      pendingSuggestions: m.role.canViewAutomation
          ? suggestions.where((s) => s.homeId == homeId && s.isPending).length
          : 0,
      unreadNotifications: mine.length,
    );
  }

  /// Relay command (FR-5.3). The real server acks within 5 s or answers 504.
  CommandResult sendCommand(int deviceId, PowerAction action) {
    final found = requireDevice(deviceId);
    final device = found.device;
    final m = found.membership;
    if (m.role == HomeRole.viewer) forbidden();
    if (!device.isRelay) throw _error(ApiErrorCode.notControllable, 400);
    if (!device.canControl) forbidden();
    requireWritable(device.homeId);
    if (device.isBlocked) throw _error(ApiErrorCode.deviceBlocked, 409);
    if (!device.online) throw _error(ApiErrorCode.deviceOffline, 409);

    final stamp = now;
    final updated = devices
        .firstWhere((d) => d.id == deviceId)
        .copyWith(power: action == PowerAction.turnOn, lastSeen: stamp);
    _replaceDevice(updated);
    _emitDeviceState(updated);
    return CommandResult(
      id: nextId('command'),
      action: action,
      status: 'acked',
      issuedAt: stamp,
      ackedAt: stamp,
      device: deviceView(updated, m),
    );
  }

  /// Deterministic 24 h (5 min buckets) / 7 d (1 h buckets) series.
  TelemetrySeries telemetryFor(int deviceId, TelemetryRange range) {
    final device = requireDevice(deviceId).device;
    final is24h = range == TelemetryRange.last24Hours;
    final bucketSeconds = is24h ? 300 : 3600;
    if (!device.isSensor) {
      return TelemetrySeries(
        deviceId: deviceId,
        range: range,
        bucketSeconds: bucketSeconds,
        points: const [],
        latest: device.latest,
      );
    }
    final base = _climateBase[deviceId] ?? (temperature: 29.0, humidity: 65.0);
    final bucketMs = bucketSeconds * 1000;
    final endMs = (now.millisecondsSinceEpoch ~/ bucketMs) * bucketMs;
    final count = is24h ? 288 : 168;
    final points = <TelemetryPoint>[];
    for (var i = count - 1; i >= 0; i--) {
      final time = DateTime.fromMillisecondsSinceEpoch(
        endMs - i * bucketMs,
        isUtc: true,
      );
      final local = time.toLocal();
      final hour = local.hour + local.minute / 60;
      final wave = math.sin(2 * math.pi * (hour - 9) / 24);
      points.add(
        TelemetryPoint(
          time: time,
          temperature: double.parse(
            (base.temperature +
                    2.2 * wave +
                    _noise(deviceId, time.millisecondsSinceEpoch ~/ bucketMs) *
                        0.6)
                .toStringAsFixed(1),
          ),
          humidity: double.parse(
            (base.humidity -
                    6 * wave +
                    _noise(deviceId + 91, time.millisecondsSinceEpoch ~/ bucketMs) *
                        3)
                .toStringAsFixed(1),
          ),
        ),
      );
    }
    return TelemetrySeries(
      deviceId: deviceId,
      range: range,
      bucketSeconds: bucketSeconds,
      points: points,
      latest: device.latest,
    );
  }

  double _noise(int a, int b) {
    var h = (a * 73856093) ^ (b * 19349663);
    h = (h ^ (h >> 13)) * 1274126177;
    h = (h ^ (h >> 16)) & 0x7FFFFFFF;
    return (h % 1000) / 1000 - 0.5;
  }

  // ----------------------------------------------------------- notifications

  AppNotification addNotification({
    required int userId,
    required int? homeId,
    required String type,
    required String title,
    required String message,
    required Severity severity,
    bool isRead = false,
    DateTime? createdAt,
    bool emit = true,
  }) {
    final notification = AppNotification(
      id: nextId('notification'),
      homeId: homeId,
      homeName: homeId == null ? null : homeRecord(homeId).home.name,
      type: type,
      title: title,
      message: message,
      severity: severity,
      isRead: isRead,
      createdAt: createdAt ?? now,
    );
    notifications.add(
      MockNotificationRow(userId: userId, notification: notification),
    );
    if (emit) {
      _events.add(
        MockEvent(
          homeId: homeId,
          userId: userId,
          message: RealtimeMessage('notification', {
            'type': 'notification',
            'home_id': homeId,
            'notification': {
              'id': notification.id,
              'home_id': homeId,
              'home_name': notification.homeName,
              'type': type,
              'title': title,
              'message': message,
              'severity': severity.apiValue,
              'is_read': isRead,
              'created_at': notification.createdAt.toUtc().toIso8601String(),
            },
          }),
        ),
      );
    }
    return notification;
  }

  /// Everyone who currently belongs to [homeId].
  List<int> memberIds(int homeId, {bool controlOnly = false}) => [
    for (final m in memberships)
      if (m.homeId == homeId &&
          m.userId != null &&
          _isEffective(m) &&
          (!controlOnly || m.role.canEditAutomation))
        m.userId!,
  ];

  // ----------------------------------------------------------------- events

  void _emit(MockEvent event) {
    if (!_events.isClosed) _events.add(event);
  }

  void _emitDeviceState(CustomerDevice d) => _emit(
    MockEvent(
      homeId: d.homeId,
      message: RealtimeMessage('device_state', {
        'type': 'device_state',
        'home_id': d.homeId,
        'device': {
          'id': d.id,
          'room_id': d.roomId,
          'online': d.online,
          'last_seen': d.lastSeen?.toUtc().toIso8601String(),
          'power': d.power,
          'status': d.status.name,
        },
      }),
    ),
  );

  void emitHomeChanged(int homeId) => _emit(
    MockEvent(
      homeId: homeId,
      message: RealtimeMessage('home_changed', {
        'type': 'home_changed',
        'home_id': homeId,
      }),
    ),
  );

  /// One step of the mock "sensor network": random-walks every online sensor.
  void simulateTick() {
    final stamp = now;
    for (var i = 0; i < devices.length; i++) {
      final d = devices[i];
      if (!d.isSensor || !d.online) continue;
      if (homeRecord(d.homeId).home.isSuspended) continue;
      final base = _climateBase[d.id];
      if (base == null) continue;
      final previous = d.latest;
      final temperature = _clamp(
        (previous?.temperature ?? base.temperature) +
            (_random.nextDouble() - 0.5) * 0.6,
        base.temperature - 3,
        base.temperature + 3,
      );
      final humidity = _clamp(
        (previous?.humidity ?? base.humidity) +
            (_random.nextDouble() - 0.5) * 2,
        base.humidity - 8,
        base.humidity + 8,
      );
      final reading = Reading(
        temperature: double.parse(temperature.toStringAsFixed(1)),
        humidity: double.parse(humidity.toStringAsFixed(1)),
        receivedAt: stamp,
      );
      final updated = d.copyWith(latest: reading, lastSeen: stamp);
      devices[i] = updated;
      _emit(
        MockEvent(
          homeId: d.homeId,
          message: RealtimeMessage('telemetry', {
            'type': 'telemetry',
            'home_id': d.homeId,
            'room_id': d.roomId,
            'device_id': d.id,
            'reading': {
              'temperature': reading.temperature,
              'humidity': reading.humidity,
              'door_open': null,
              'received_at': stamp.toUtc().toIso8601String(),
            },
          }),
        ),
      );
    }
  }

  /// A door-open event: updates the door sensor and warns every member.
  void simulateDoorOpened(int homeId) {
    final index = devices.indexWhere(
      (d) => d.homeId == homeId && d.isDoorContact && d.online,
    );
    if (index < 0) return;
    final stamp = now;
    final updated = devices[index].copyWith(
      latest: Reading(doorOpen: true, receivedAt: stamp),
      lastSeen: stamp,
    );
    devices[index] = updated;
    _emit(
      MockEvent(
        homeId: homeId,
        message: RealtimeMessage('telemetry', {
          'type': 'telemetry',
          'home_id': homeId,
          'room_id': updated.roomId,
          'device_id': updated.id,
          'reading': {
            'temperature': null,
            'humidity': null,
            'door_open': true,
            'received_at': stamp.toUtc().toIso8601String(),
          },
        }),
      ),
    );
    for (final userId in memberIds(homeId)) {
      addNotification(
        userId: userId,
        homeId: homeId,
        type: 'DOOR_OPENED',
        title: 'Cửa chính vừa được mở',
        message: 'Cảm biến cửa chính ghi nhận cửa đang mở.',
        severity: Severity.warning,
      );
    }
  }

  double _clamp(double value, double low, double high) =>
      value < low ? low : (value > high ? high : value);

  // ------------------------------------------------------------------ claim

  ClaimResult claim({String? code, String? qrPayload}) {
    final userId = meId;
    final stamp = now;
    final recent = (_failedClaims[userId] ?? const <DateTime>[])
        .where((t) => stamp.difference(t) < const Duration(minutes: 15))
        .toList();
    _failedClaims[userId] = recent;
    if (recent.length >= 5) {
      final wait = const Duration(minutes: 15) - stamp.difference(recent.first);
      throw _error(
        ApiErrorCode.rateLimited,
        429,
        retryAfterSeconds: wait.inSeconds < 1 ? 60 : wait.inSeconds,
      );
    }

    Never fail(String errorCode, int status) {
      _failedClaims[userId] = [...recent, stamp];
      throw _error(errorCode, status);
    }

    String? normalized;
    if (qrPayload != null) {
      final match = RegExp(
        r'^SH1:([0-9A-Za-z]{12}):([0-9a-fA-F]{16})$',
      ).firstMatch(qrPayload.trim());
      if (match != null) normalized = normalizeActivationCode(match.group(1)!);
    } else {
      normalized = normalizeActivationCode(code ?? '');
    }
    if (normalized == null || !isValidActivationCode(normalized)) {
      fail(ApiErrorCode.notFound, 404);
    }

    MockActivationCode? token;
    for (final candidate in codes) {
      if (candidate.code == normalized) token = candidate;
    }
    if (token == null) fail(ApiErrorCode.notFound, 404);
    if (token.usedByUserId != null) fail(ApiErrorCode.alreadyUsed, 409);
    if (!token.expiresAt.isAfter(stamp)) fail(ApiErrorCode.expired, 410);

    final record = homeRecord(token.homeId);
    if (record.home.status != HomeStatus.unclaimed) {
      fail(ApiErrorCode.alreadyUsed, 409);
    }
    token.usedByUserId = userId;
    record.home = Home(
      id: record.home.id,
      name: record.home.name,
      address: record.home.address,
      package: record.home.package,
      status: HomeStatus.active,
      timezone: record.home.timezone,
      ownerCustomerId: me.customerId,
      gatewayId: record.home.gatewayId,
      activatedAt: stamp,
      createdAt: record.home.createdAt,
    );
    record.gatewayOnline = true;
    record.gatewayLastSeen = stamp;
    memberships.add(
      MockMembership(
        id: nextId('member'),
        homeId: record.home.id,
        userId: userId,
        role: HomeRole.owner,
        displayName: me.fullName,
        createdAt: stamp,
        acceptedAt: stamp,
      ),
    );
    // Devices of a freshly claimed kit start online (simulated hardware).
    for (var i = 0; i < devices.length; i++) {
      if (devices[i].homeId != record.home.id) continue;
      devices[i] = devices[i].copyWith(online: true, lastSeen: stamp);
    }
    addNotification(
      userId: userId,
      homeId: record.home.id,
      type: 'HOME_CLAIMED',
      title: 'Smart Home đã sẵn sàng',
      message: 'Bạn là chủ nhà của ${record.home.name}.',
      severity: Severity.success,
    );
    return ClaimResult(home: record.home, role: HomeRole.owner);
  }

  // ------------------------------------------------------------------- seed

  void _seed() {
    final stamp = now;
    DateTime ago(Duration d) => stamp.subtract(d);

    void account(
      int id,
      int customerId,
      String email,
      String name,
      String tag, {
      String? phone,
      String? address,
      String password = 'user123',
      String role = 'user',
    }) => accounts.add(
      MockAccount(
        id: id,
        customerId: customerId,
        email: email,
        password: password,
        fullName: name,
        userTag: tag,
        joinedAt: ago(const Duration(days: 40)),
        phone: phone,
        address: address,
        role: role,
      ),
    );

    // Staff are listed only so the app can show the USE_DASHBOARD guidance.
    account(
      1,
      0,
      'admin@smarthome.local',
      'Quản trị viên',
      'admin#0001',
      password: 'admin123',
      role: 'admin',
    );
    account(
      2,
      0,
      'operator01@smarthome.local',
      'Vận hành 01',
      'operator#0001',
      password: 'operator123',
      role: 'operator',
    );
    account(
      7,
      1,
      'user01@smarthome.local',
      'Nguyễn Hoàng Đạt',
      'dat#4821',
      phone: '0901 234 567',
      address: '25 Nguyễn Văn Linh, Quận 7, TP. Hồ Chí Minh',
    );
    account(8, 2, 'lan@smarthome.local', 'Trần Thị Lan', 'lan#3312');
    account(9, 3, 'hoa@smarthome.local', 'Phạm Thị Hoa', 'hoa#7756');
    account(10, 4, 'hung@smarthome.local', 'Lê Văn Hùng', 'hung#2094');
    account(11, 5, 'kimanh@smarthome.local', 'Ngô Kim Anh', 'kimanh#1560');
    // Mock-only: lets you try the GUEST invitation (contract §8 invite).
    account(12, 6, 'minh@smarthome.local', 'Lê Quang Minh', 'minh#6073');

    // Homes 1–5 (contract §8).
    final home1 = _addHome(
      'Nhà của Đạt',
      'KIT_A',
      HomeStatus.active,
      owner: accounts.firstWhere((a) => a.id == 7),
      address: '25 Nguyễn Văn Linh, Quận 7, TP. Hồ Chí Minh',
      gatewayOnline: true,
      seen: ago(const Duration(seconds: 12)),
      claimedAt: ago(const Duration(days: 30)),
    );
    final home2 = _addHome(
      'Nhà Quận 7',
      'KIT_A',
      HomeStatus.active,
      owner: accounts.firstWhere((a) => a.id == 10),
      address: '8 Hoàng Quốc Việt, Quận 7, TP. Hồ Chí Minh',
      gatewayOnline: false,
      seen: ago(const Duration(hours: 3)),
      claimedAt: ago(const Duration(days: 12)),
    );
    final home3 = _addHome(
      'Kit KIT_A #0003',
      'KIT_A',
      HomeStatus.unclaimed,
      gatewayOnline: false,
    );
    final home4 = _addHome(
      'Kit KIT_B #0004',
      'KIT_B',
      HomeStatus.unclaimed,
      gatewayOnline: false,
    );
    final home5 = _addHome(
      'Kit KIT_A #0005',
      'KIT_A',
      HomeStatus.unclaimed,
      gatewayOnline: false,
    );

    codes.addAll([
      MockActivationCode(
        code: normalizeActivationCode('7K2M-9QXA-4TPB'),
        homeId: home3,
        expiresAt: stamp.add(const Duration(days: 180)),
      ),
      MockActivationCode(
        code: normalizeActivationCode('H3VD-8NRW-2CYE'),
        homeId: home4,
        expiresAt: stamp.add(const Duration(days: 180)),
      ),
      MockActivationCode(
        code: normalizeActivationCode('B9FE-3WRA-7GMK'),
        homeId: home5,
        expiresAt: stamp.subtract(const Duration(days: 2)),
      ),
      MockActivationCode(
        code: normalizeActivationCode('Q4ZT-6MJK-1PSX'),
        homeId: home2,
        expiresAt: stamp.add(const Duration(days: 100)),
        usedByUserId: 10,
      ),
    ]);

    // Memberships of "Nhà của Đạt": Lan CONTROLLER, Hoa VIEWER, pending GUEST.
    MockMembership member(
      int homeId,
      int? userId,
      HomeRole role,
      String name, {
      String? inviteEmail,
      DateTime? inviteExpires,
      DateTime? expires,
      Set<int>? guestDevices,
      int? invitedBy,
    }) {
      final m = MockMembership(
        id: nextId('member'),
        homeId: homeId,
        userId: userId,
        role: role,
        displayName: name,
        createdAt: ago(const Duration(days: 20)),
        acceptedAt: userId == null ? null : ago(const Duration(days: 20)),
        inviteEmail: inviteEmail,
        inviteExpiresAt: inviteExpires,
        expiresAt: expires,
        guestDeviceIds: guestDevices,
        invitedBy: invitedBy,
      );
      memberships.add(m);
      return m;
    }

    member(home1, 7, HomeRole.owner, 'Nguyễn Hoàng Đạt');
    member(home1, 8, HomeRole.controller, 'Trần Thị Lan', invitedBy: 7);
    member(home1, 9, HomeRole.viewer, 'Phạm Thị Hoa', invitedBy: 7);
    final livingLight = devices.firstWhere(
      (d) => d.homeId == home1 && d.name == 'Đèn phòng khách',
    );
    member(
      home1,
      null,
      HomeRole.guest,
      'Minh',
      inviteEmail: 'minh@smarthome.local',
      inviteExpires: stamp.add(const Duration(days: 7)),
      expires: stamp.add(const Duration(days: 3)),
      guestDevices: {livingLight.id},
      invitedBy: 7,
    );
    member(home2, 10, HomeRole.owner, 'Lê Văn Hùng');

    // Live-looking state of "Nhà của Đạt".
    _replaceDevice(livingLight.copyWith(power: true));

    // Automation rules (contract §8).
    final bedroom = rooms.firstWhere(
      (r) => r.homeId == home1 && r.roomType == 'bedroom',
    );
    final fan = devices.firstWhere(
      (d) => d.homeId == home1 && d.name == 'Quạt phòng ngủ',
    );
    final kitchenLight = devices.firstWhere(
      (d) => d.homeId == home1 && d.name == 'Đèn nhà bếp',
    );
    final hotRoom = AutomationRule(
      id: nextId('rule'),
      homeId: home1,
      homeName: 'Nhà của Đạt',
      name: 'Phòng ngủ nóng → bật quạt',
      enabled: true,
      triggerType: TriggerType.sensorThreshold,
      triggerRoomId: bedroom.id,
      triggerRoomName: bedroom.name,
      triggerMetric: TriggerMetric.temperature,
      triggerOperator: TriggerOperator.greater,
      triggerThreshold: 30,
      actionDeviceId: fan.id,
      actionDeviceName: fan.name,
      actionCommand: RuleAction.turnOn,
      origin: RuleOrigin.user,
      createdByUserId: 7,
      createdByName: 'Nguyễn Hoàng Đạt',
      lastTriggeredAt: ago(const Duration(hours: 5)),
      createdAt: ago(const Duration(days: 14)),
      canEdit: true,
      canDelete: true,
    );
    final kitchenOff = AutomationRule(
      id: nextId('rule'),
      homeId: home1,
      homeName: 'Nhà của Đạt',
      name: 'Tắt đèn bếp lúc 23:30',
      enabled: true,
      triggerType: TriggerType.schedule,
      scheduleTime: '23:30',
      scheduleDays: const [1, 2, 3, 4, 5, 6, 7],
      actionDeviceId: kitchenLight.id,
      actionDeviceName: kitchenLight.name,
      actionCommand: RuleAction.turnOff,
      origin: RuleOrigin.user,
      createdByUserId: 7,
      createdByName: 'Nguyễn Hoàng Đạt',
      lastTriggeredAt: ago(const Duration(hours: 18)),
      createdAt: ago(const Duration(days: 10)),
      canEdit: true,
      canDelete: true,
    );
    rules.addAll([hotRoom, kitchenOff]);
    ruleRuns[hotRoom.id] = [
      RuleRun(
        id: nextId('run'),
        triggeredAt: ago(const Duration(hours: 5)),
        result: RunResult.success,
        details: const {'message': 'Nhiệt độ Phòng ngủ 30,6°C — đã bật Quạt phòng ngủ.'},
      ),
      RuleRun(
        id: nextId('run'),
        triggeredAt: ago(const Duration(days: 1, hours: 4)),
        result: RunResult.success,
      ),
      RuleRun(
        id: nextId('run'),
        triggeredAt: ago(const Duration(days: 3, hours: 6)),
        result: RunResult.failed,
        details: const {'message': 'Thiết bị đang ngoại tuyến.'},
      ),
    ];
    ruleRuns[kitchenOff.id] = [
      RuleRun(
        id: nextId('run'),
        triggeredAt: ago(const Duration(hours: 18)),
        result: RunResult.success,
      ),
      RuleRun(
        id: nextId('run'),
        triggeredAt: ago(const Duration(days: 1, hours: 18)),
        result: RunResult.skipped,
        details: const {'message': 'Đèn đã tắt sẵn.'},
      ),
    ];

    // Pending AI suggestion (presented 2 days ago, FR-7.4).
    suggestions.add(
      HabitSuggestion(
        id: nextId('suggestion'),
        homeId: home1,
        deviceId: livingLight.id,
        deviceName: livingLight.name,
        roomName: livingLight.roomName,
        action: RuleAction.turnOff,
        timeOfDay: '23:00',
        daysMatched: 6,
        windowDays: 7,
        status: SuggestionStatus.pending,
        createdAt: ago(const Duration(days: 2)),
      ),
    );

    // Notifications.
    for (final userId in [7, 8, 9]) {
      addNotification(
        userId: userId,
        homeId: home1,
        type: 'GATEWAY_ONLINE',
        title: 'Gateway đã kết nối lại',
        message: 'Gateway của Nhà của Đạt đã online trở lại.',
        severity: Severity.success,
        isRead: true,
        createdAt: ago(const Duration(hours: 6)),
        emit: false,
      );
      addNotification(
        userId: userId,
        homeId: home1,
        type: 'AUTOMATION_RUN',
        title: 'Quy tắc đã chạy',
        message: 'Quy tắc “Phòng ngủ nóng → bật quạt” đã chạy: Bật Quạt phòng ngủ.',
        severity: Severity.info,
        isRead: userId != 7,
        createdAt: ago(const Duration(hours: 5)),
        emit: false,
      );
      addNotification(
        userId: userId,
        homeId: home1,
        type: 'DOOR_OPENED',
        title: 'Cửa chính vừa được mở',
        message: 'Cảm biến cửa chính ghi nhận cửa mở lúc 07:58.',
        severity: Severity.warning,
        createdAt: ago(const Duration(minutes: 35)),
        emit: false,
      );
    }
    for (final userId in [7, 8]) {
      addNotification(
        userId: userId,
        homeId: home1,
        type: 'SUGGESTION_NEW',
        title: 'Gợi ý mới từ AI',
        message: 'Bạn thường tắt Đèn phòng khách lúc 23:00. Tạo quy tắc tự động?',
        severity: Severity.info,
        createdAt: ago(const Duration(days: 2)),
        emit: false,
      );
    }
    addNotification(
      userId: 10,
      homeId: home2,
      type: 'GATEWAY_OFFLINE',
      title: 'Gateway mất kết nối',
      message: 'Gateway của Nhà Quận 7 không phản hồi. Kiểm tra nguồn điện và WiFi.',
      severity: Severity.critical,
      createdAt: ago(const Duration(hours: 3)),
      emit: false,
    );
  }

  int _addHome(
    String name,
    String package,
    HomeStatus status, {
    MockAccount? owner,
    String? address,
    required bool gatewayOnline,
    DateTime? seen,
    DateTime? claimedAt,
  }) {
    final homeId = nextId('home');
    final gatewayDeviceId = nextId('device');
    final record = MockHomeRecord(
      home: Home(
        id: homeId,
        name: name,
        address: address,
        package: package,
        status: status,
        timezone: 'Asia/Ho_Chi_Minh',
        ownerCustomerId: owner?.customerId,
        gatewayId: gatewayDeviceId,
        activatedAt: claimedAt,
        createdAt: now.subtract(const Duration(days: 45)),
      ),
      gatewayUid: _uid('GW', gatewayDeviceId),
      gatewayOnline: gatewayOnline,
      gatewayLastSeen: seen,
    );
    homes.add(record);

    final online = gatewayOnline;
    final lastSeen = seen;

    int addRoom(String roomName, String type, int order) {
      final id = nextId('room');
      rooms.add(
        RoomSummary(
          id: id,
          homeId: homeId,
          name: roomName,
          roomType: type,
          sortOrder: order,
        ),
      );
      return id;
    }

    void addDevice(
      int roomId,
      String roomName,
      String deviceName,
      DeviceCategory category, {
      ({double temperature, double humidity})? climate,
    }) {
      final id = nextId('device');
      Reading? latest;
      if (category == DeviceCategory.sensor && climate != null) {
        _climateBase[id] = climate;
        latest = Reading(
          temperature: climate.temperature,
          humidity: climate.humidity,
          receivedAt: lastSeen,
        );
      } else if (category == DeviceCategory.doorContact) {
        latest = Reading(doorOpen: false, receivedAt: lastSeen);
      }
      devices.add(
        CustomerDevice(
          id: id,
          deviceUid: _uid(_prefix(category), id),
          name: deviceName,
          category: category,
          homeId: homeId,
          roomId: roomId,
          roomName: roomName,
          status: DeviceStatus.active,
          online: online,
          canControl: false,
          lastSeen: lastSeen,
          power: category == DeviceCategory.relay ? false : null,
          latest: latest,
        ),
      );
    }

    final door = addRoom('Cửa chính', 'door', 0);
    addDevice(door, 'Cửa chính', 'Cảm biến cửa chính', DeviceCategory.doorContact);
    if (package == 'KIT_B') {
      addDevice(door, 'Cửa chính', 'Camera cửa chính', DeviceCategory.camera);
    }
    final living = addRoom('Phòng khách', 'living_room', 1);
    addDevice(
      living,
      'Phòng khách',
      'Cảm biến nhiệt/ẩm phòng khách',
      DeviceCategory.sensor,
      climate: (temperature: 29.5, humidity: 66.0),
    );
    addDevice(living, 'Phòng khách', 'Đèn phòng khách', DeviceCategory.relay);
    final bedroom = addRoom('Phòng ngủ', 'bedroom', 2);
    addDevice(
      bedroom,
      'Phòng ngủ',
      'Cảm biến nhiệt/ẩm phòng ngủ',
      DeviceCategory.sensor,
      climate: (temperature: 31.2, humidity: 72.0),
    );
    addDevice(bedroom, 'Phòng ngủ', 'Quạt phòng ngủ', DeviceCategory.relay);
    final kitchen = addRoom('Nhà bếp', 'kitchen', 3);
    addDevice(
      kitchen,
      'Nhà bếp',
      'Cảm biến nhiệt/ẩm nhà bếp',
      DeviceCategory.sensor,
      climate: (temperature: 30.1, humidity: 60.0),
    );
    addDevice(kitchen, 'Nhà bếp', 'Đèn nhà bếp', DeviceCategory.relay);
    if (package == 'KIT_B') {
      final office = addRoom('Phòng làm việc', 'office', 4);
      addDevice(
        office,
        'Phòng làm việc',
        'Cảm biến nhiệt/ẩm phòng làm việc',
        DeviceCategory.sensor,
        climate: (temperature: 28.7, humidity: 58.0),
      );
      addDevice(office, 'Phòng làm việc', 'Đèn phòng làm việc', DeviceCategory.relay);
    }
    return homeId;
  }

  String _prefix(DeviceCategory category) => switch (category) {
    DeviceCategory.gateway => 'GW',
    DeviceCategory.sensor => 'SN',
    DeviceCategory.relay => 'RL',
    DeviceCategory.camera => 'CM',
    DeviceCategory.doorContact => 'DC',
  };

  /// Public device identifier shaped like `ESP32-RL-A1B2C3D4E5F6` (not a
  /// secret; the mock has no secrets at all).
  String _uid(String prefix, int id) {
    final hex = (0xA1B2C3000000 + id * 7919).toRadixString(16).toUpperCase();
    return 'ESP32-$prefix-${hex.padLeft(12, '0')}';
  }
}
