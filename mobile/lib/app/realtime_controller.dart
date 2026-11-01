import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../core/realtime/realtime_source.dart';
import '../core/widgets/app_feedback.dart';
import '../modules/auth/auth.dart';
import '../modules/automation/automation.dart';
import '../modules/homes/homes.dart';
import '../modules/notifications/notifications.dart';
import '../modules/realtime/realtime.dart';
import 'shell/shell_providers.dart';

/// Keeps the app in sync (FR-5.6): applies WebSocket events to the providers
/// and, while the socket is down, polls REST every 15 s (docs/architecture/MOBILE_APP_ARCHITECTURE.md §11.3).
/// Lives in the composition root because one event fans out to several
/// modules (docs/DESIGN_PATTERNS.md §5.2a) and to the shell's tab state.
class RealtimeController extends Notifier<RealtimeStatus> {
  static const pollInterval = Duration(seconds: 15);

  StreamSubscription<RealtimeMessage>? _messages;
  StreamSubscription<RealtimeStatus>? _statuses;
  Timer? _poll;
  RealtimeSource? _source;

  @override
  RealtimeStatus build() {
    final enabled = ref.watch(realtimeEnabledProvider);
    final userId = ref.watch(sessionUserIdProvider);
    final hasHome = ref.watch(
      homesProvider.select((homes) => homes.value?.homes.isNotEmpty ?? false),
    );
    ref.onDispose(_teardown);
    if (!enabled || userId == null || !hasHome) {
      return RealtimeStatus.disconnected;
    }

    final source = ref.watch(realtimeSourceProvider);
    _source = source;
    _messages = source.messages.listen(_onMessage);
    _statuses = source.statuses.listen(_onStatus);
    unawaited(source.start());
    if (source.status != RealtimeStatus.connected) _startPolling();
    return source.status;
  }

  void _teardown() {
    _poll?.cancel();
    _poll = null;
    unawaited(_messages?.cancel());
    unawaited(_statuses?.cancel());
    _messages = null;
    _statuses = null;
    unawaited(_source?.stop());
    _source = null;
  }

  void _onStatus(RealtimeStatus status) {
    if (!ref.mounted) return;
    state = status;
    if (status == RealtimeStatus.connected) {
      _poll?.cancel();
      _poll = null;
      // Catch up on whatever happened while the socket was down.
      unawaited(syncNow());
    } else {
      _startPolling();
    }
  }

  void _startPolling() {
    _poll ??= Timer.periodic(pollInterval, (_) => unawaited(syncNow()));
  }

  /// REST refresh of the visible data (polling fallback, app resume).
  Future<void> syncNow() async {
    if (!ref.mounted) return;
    final homes = ref.read(homesProvider.notifier);
    final notifications = ref.read(notificationsProvider.notifier);
    await homes.refresh();
    if (!ref.mounted) return;
    final current = ref.read(currentHomeProvider);
    if (current != null && ref.exists(homeOverviewProvider(current.id))) {
      await ref.read(homeOverviewProvider(current.id).notifier).refresh();
    }
    if (!ref.mounted) return;
    await notifications.refresh();
  }

  HomeOverviewNotifier? _overview(int homeId) => ref.exists(
        homeOverviewProvider(homeId),
      )
      ? ref.read(homeOverviewProvider(homeId).notifier)
      : null;

  void _onMessage(RealtimeMessage message) {
    if (!ref.mounted) return;
    final event = parseRealtimeEvent(message);
    if (event == null) return;
    switch (event) {
      case DeviceStateEvent():
        _overview(event.homeId)?.applyDeviceState(event);
      case TelemetryEvent():
        _overview(event.homeId)?.applyTelemetry(event);
      case NotificationEvent():
        _onNotification(event);
      case HomeChangedEvent():
        _onHomeChanged(event.homeId);
    }
  }

  void _onNotification(NotificationEvent event) {
    final notification = event.notification;
    ref.read(notificationsProvider.notifier).onRealtime(notification);
    if (notification.type == 'MEMBER_INVITED') {
      ref.invalidate(invitationsProvider);
    }
    if (notification.isRead) return;
    final selectTab = ref.read(shellTabProvider.notifier).select;
    showAppSnack(
      ref.read(rootMessengerKeyProvider).currentState,
      '${notification.title}. ${notification.message}',
      action: SnackBarAction(
        label: 'Xem',
        onPressed: () => selectTab(ShellTab.notifications),
      ),
    );
  }

  void _onHomeChanged(int homeId) {
    unawaited(ref.read(homesProvider.notifier).refresh());
    unawaited(_overview(homeId)?.refresh());
    ref
      ..invalidate(membersProvider(homeId))
      ..invalidate(automationRulesProvider(homeId))
      ..invalidate(suggestionsProvider(homeId));
  }
}

final realtimeControllerProvider =
    NotifierProvider.autoDispose<RealtimeController, RealtimeStatus>(
      RealtimeController.new,
    );
