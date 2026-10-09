import 'dart:async';

import 'package:flutter/foundation.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../../core/config/app_config.dart';
import '../../../../core/network/api_exception.dart';
import '../../../../core/network/network_providers.dart';
import '../../../../core/storage/session_storage.dart';
import '../../../../mock/mock_providers.dart';
import '../../../auth/presentation/providers/auth_providers.dart';
import '../../../devices/domain/device.dart';
import '../../../devices/presentation/providers/device_providers.dart';
import '../../../rooms/presentation/providers/room_providers.dart';
import '../../../shell/domain/realtime_event.dart';
import '../../data/home_mock_repository.dart';
import '../../data/home_remote_repository.dart';
import '../../domain/home.dart';
import '../../domain/home_repository.dart';
import '../../domain/overview.dart';

final homeRepositoryProvider = Provider<HomeRepository>((ref) {
  final config = ref.watch(appConfigProvider);
  if (config.useMock) {
    return MockHomeRepository(ref.watch(mockBackendProvider));
  }
  return RemoteHomeRepository(ref.watch(apiClientProvider));
});

/// My homes + which one is selected (FR-5.1 home switcher).
@immutable
class HomesState {
  const HomesState({this.homes = const [], this.currentId});

  final List<MyHome> homes;
  final int? currentId;

  bool get isEmpty => homes.isEmpty;

  MyHome? get current {
    for (final home in homes) {
      if (home.id == currentId) return home;
    }
    return homes.isEmpty ? null : homes.first;
  }

  MyHome? byId(int id) {
    for (final home in homes) {
      if (home.id == id) return home;
    }
    return null;
  }

  HomesState copyWith({List<MyHome>? homes, int? currentId}) => HomesState(
    homes: homes ?? this.homes,
    currentId: currentId ?? this.currentId,
  );
}

class HomesNotifier extends AsyncNotifier<HomesState> {
  @override
  Future<HomesState> build() async {
    final userId = ref.watch(sessionUserIdProvider);
    final repository = ref.watch(homeRepositoryProvider);
    final storage = ref.watch(sessionStorageProvider);
    if (userId == null) return const HomesState();
    final homes = await repository.listHomes();
    final saved = await storage.readCurrentHomeId();
    return HomesState(homes: homes, currentId: _pick(homes, saved));
  }

  int? _pick(List<MyHome> homes, int? preferred) {
    if (homes.isEmpty) return null;
    for (final home in homes) {
      if (home.id == preferred) return home.id;
    }
    return homes.first.id;
  }

  /// Silent refetch (polling, `home_changed`, pull to refresh). Keeps the
  /// selection when the home still exists, otherwise falls back to the first.
  Future<void> refresh({bool throwOnError = false}) async {
    final previous = state.value;
    try {
      final homes = await ref.read(homeRepositoryProvider).listHomes();
      if (!ref.mounted) return;
      state = AsyncData(
        HomesState(
          homes: homes,
          currentId: _pick(homes, previous?.currentId),
        ),
      );
    } on Object {
      if (throwOnError) rethrow;
    }
  }

  void select(int homeId) {
    final current = state.value;
    if (current == null || current.byId(homeId) == null) return;
    state = AsyncData(current.copyWith(currentId: homeId));
    unawaited(ref.read(sessionStorageProvider).writeCurrentHomeId(homeId));
  }

  /// After a claim or an accepted invitation.
  void addOrReplace(MyHome home, {bool select = true}) {
    final current = state.value ?? const HomesState();
    final exists = current.byId(home.id) != null;
    final homes = exists
        ? [for (final h in current.homes) h.id == home.id ? home : h]
        : [...current.homes, home];
    state = AsyncData(
      HomesState(
        homes: homes,
        currentId: select ? home.id : _pick(homes, current.currentId),
      ),
    );
    if (select) {
      unawaited(ref.read(sessionStorageProvider).writeCurrentHomeId(home.id));
    }
  }

  void replaceHome(Home home) {
    final current = state.value;
    if (current == null) return;
    state = AsyncData(
      current.copyWith(
        homes: [
          for (final h in current.homes)
            h.id == home.id ? h.copyWith(home: home) : h,
        ],
      ),
    );
  }
}

final homesProvider = AsyncNotifierProvider<HomesNotifier, HomesState>(
  HomesNotifier.new,
);

/// The selected home (null while loading or when the user has none).
final currentHomeProvider = Provider<MyHome?>(
  (ref) => ref.watch(homesProvider).value?.current,
);

/// Live state of one home: the source of truth for rooms and devices. REST
/// loads it, WebSocket events (or 15 s polling) keep it fresh, relay commands
/// update it optimistically.
class HomeOverviewNotifier extends AsyncNotifier<HomeOverview> {
  HomeOverviewNotifier(this.homeId);

  final int homeId;

  @override
  Future<HomeOverview> build() {
    final userId = ref.watch(sessionUserIdProvider);
    final repository = ref.watch(homeRepositoryProvider);
    if (userId == null) {
      return Future<HomeOverview>.error(
        const ApiException(code: ApiErrorCode.sessionExpired),
      );
    }
    return repository.overview(homeId);
  }

  void _update(HomeOverview Function(HomeOverview current) change) {
    final current = state.value;
    if (current == null) return;
    state = AsyncData(change(current));
  }

  /// A fresh server snapshot must not undo an optimistic switch that is still
  /// waiting for its ack.
  HomeOverview _keepPending(HomeOverview previous, HomeOverview next) {
    var merged = next;
    for (final id in ref.read(pendingCommandsProvider)) {
      final local = previous.deviceById(id);
      if (local != null) merged = merged.upsertDevice(local);
    }
    return merged;
  }

  Future<void> refresh({bool throwOnError = false}) async {
    try {
      final next = await ref.read(homeRepositoryProvider).overview(homeId);
      if (!ref.mounted) return;
      final previous = state.value;
      state = AsyncData(previous == null ? next : _keepPending(previous, next));
    } on Object {
      if (throwOnError) rethrow;
    }
  }

  /// `GET /rooms/:id`: refresh one room and its devices (FR-5.2).
  Future<void> refreshRoom(int roomId) async {
    try {
      final detail = await ref.read(roomRepositoryProvider).getRoom(roomId);
      if (!ref.mounted) return;
      _update((o) {
        var next = o.upsertRoom(detail.room);
        for (final device in detail.devices) {
          next = next.upsertDevice(device);
        }
        return next;
      });
    } on Object {
      // The overview already has a copy; a failed refresh is not fatal.
    }
  }

  /// `GET /devices/:id`: refresh one device (FR-5.3).
  Future<void> refreshDevice(int deviceId) async {
    try {
      final detail = await ref.read(deviceRepositoryProvider).getDevice(deviceId);
      if (!ref.mounted) return;
      _update((o) {
        var next = o.upsertDevice(detail.device);
        final room = detail.room;
        if (room != null) next = next.upsertRoom(room);
        return next;
      });
    } on Object {
      // Same as refreshRoom.
    }
  }

  /// FR-5.3: optimistic relay switch. The tile flips immediately, the call has
  /// an 8 s client timeout (server: 504 after 5 s) and the switch rolls back
  /// on any failure. Rethrows so the caller can show Vietnamese guidance.
  Future<void> setPower(int deviceId, bool on) async {
    final overview = state.value;
    final device = overview?.deviceById(deviceId);
    if (device == null || !device.canToggle || device.power == on) return;
    final pending = ref.read(pendingCommandsProvider.notifier);
    if (ref.read(pendingCommandsProvider).contains(deviceId)) return;

    pending.begin(deviceId);
    _update((o) => o.upsertDevice(device.copyWith(power: on)));
    try {
      final result = await ref
          .read(deviceRepositoryProvider)
          .sendCommand(deviceId, PowerAction.forPower(on));
      if (!ref.mounted) return;
      _update((o) => o.upsertDevice(result.device));
    } on Object {
      if (ref.mounted) {
        _update((o) {
          final latest = o.deviceById(deviceId);
          // Roll back unless a newer realtime event already changed it.
          if (latest != null && latest.power == on) {
            return o.upsertDevice(latest.copyWith(power: !on));
          }
          return o;
        });
      }
      rethrow;
    } finally {
      if (ref.mounted) pending.end(deviceId);
    }
  }

  Future<void> renameRoom(int roomId, String name) async {
    final room = await ref.read(roomRepositoryProvider).renameRoom(roomId, name);
    if (!ref.mounted) return;
    _update((o) {
      var next = o.upsertRoom(room);
      for (final device in o.devicesInRoom(roomId)) {
        next = next.upsertDevice(device.copyWith(roomName: room.name));
      }
      return next;
    });
  }

  Future<void> renameDevice(int deviceId, String name) async {
    final device = await ref
        .read(deviceRepositoryProvider)
        .renameDevice(deviceId, name);
    if (!ref.mounted) return;
    _update((o) => o.upsertDevice(device));
  }

  Future<void> renameHome(String name) async {
    final home = await ref
        .read(homeRepositoryProvider)
        .updateHome(homeId, name: name);
    if (!ref.mounted) return;
    _update((o) => o.copyWith(home: home));
    ref.read(homesProvider.notifier).replaceHome(home);
  }

  // ---- realtime (contract §4.3) -------------------------------------------

  void applyDeviceState(DeviceStateEvent event) {
    final current = state.value;
    if (current == null) return;
    final gateway = current.gateway;
    if (gateway != null && gateway.id == event.deviceId) {
      _update(
        (o) => o.copyWith(
          gateway: gateway.copyWith(
            online: event.online,
            lastSeen: event.lastSeen,
          ),
        ),
      );
      return;
    }
    final device = current.deviceById(event.deviceId);
    if (device == null) {
      unawaited(refresh());
      return;
    }
    _update(
      (o) => o.upsertDevice(
        device.copyWith(
          online: event.online,
          lastSeen: event.lastSeen,
          power: event.power,
          status: event.status,
          roomId: event.roomId,
        ),
      ),
    );
  }

  void applyTelemetry(TelemetryEvent event) {
    final current = state.value;
    final device = current?.deviceById(event.deviceId);
    if (current == null || device == null) return;
    final reading = event.reading;
    _update((o) {
      var next = o.upsertDevice(
        device.copyWith(
          latest: reading,
          online: true,
          lastSeen: reading.receivedAt ?? DateTime.now(),
        ),
      );
      if (device.isSensor && reading.hasClimate) {
        final room = next.roomById(event.roomId ?? device.roomId ?? -1);
        if (room != null) {
          next = next.upsertRoom(
            room.copyWith(
              temperature: reading.temperature,
              humidity: reading.humidity,
              hasClimateData: true,
              climateUpdatedAt: reading.receivedAt,
            ),
          );
        }
      }
      return next;
    });
  }

  /// A notification arrived (+1) or was read (-1).
  void adjustUnread({required int delta, required bool isAlert}) {
    _update((o) {
      int clamp(int value) => value < 0 ? 0 : value;
      return o.copyWith(
        unreadNotifications: clamp(o.unreadNotifications + delta),
        openAlerts: isAlert ? clamp(o.openAlerts + delta) : o.openAlerts,
      );
    });
  }

  void setPendingSuggestions(int count) =>
      _update((o) => o.copyWith(pendingSuggestions: count < 0 ? 0 : count));
}

final homeOverviewProvider =
    AsyncNotifierProvider.family<HomeOverviewNotifier, HomeOverview, int>(
      HomeOverviewNotifier.new,
    );

/// Overview of the selected home (loading while no home is selected yet).
final currentOverviewProvider = Provider<AsyncValue<HomeOverview>>((ref) {
  final home = ref.watch(currentHomeProvider);
  if (home == null) return const AsyncLoading();
  return ref.watch(homeOverviewProvider(home.id));
});
