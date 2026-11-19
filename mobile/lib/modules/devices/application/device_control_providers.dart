import 'dart:async';

import 'package:flutter/foundation.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../auth/auth.dart';
import '../domain/ac_codes.dart';

/// Air-conditioner set points the user is still adjusting: shown immediately
/// by the −/+ buttons while the single `set_temp` is waiting for the 600 ms of
/// quiet and for the Node's ack. Removed when the command ends (the server
/// value, or the old value after a failure, shows again).
class SetpointDraftsNotifier extends Notifier<Map<int, int>> {
  @override
  Map<int, int> build() {
    ref.watch(sessionUserIdProvider);
    return const {};
  }

  void put(int deviceId, int temperature) =>
      state = {...state, deviceId: temperature};

  void remove(int deviceId) => state = {...state}..remove(deviceId);
}

final setpointDraftsProvider =
    NotifierProvider<SetpointDraftsNotifier, Map<int, int>>(
      SetpointDraftsNotifier.new,
    );

/// IR code learning of an air conditioner: one slot at a time (the Node is
/// listening to the remote), a 10 s countdown while it listens, then "waiting
/// for the Node's answer" until the command ends with a [notice].
@immutable
class AcLearnState {
  const AcLearnState({
    this.deviceId,
    this.slot,
    this.secondsLeft = learnWindowSeconds,
    this.notice,
  });

  /// The device being taught; with [slot] `null` nothing is being learned.
  final int? deviceId;
  final AcSlot? slot;

  /// Seconds left of the window to press the remote; 0 = time is up and the
  /// app is waiting for the Node's answer.
  final int secondsLeft;

  /// Result of the last attempt.
  final AcLearnNotice? notice;

  bool get isLearning => slot != null;

  bool isLearningDevice(int id) => slot != null && deviceId == id;
}

class AcLearnNotifier extends Notifier<AcLearnState> {
  Timer? _timer;

  @override
  AcLearnState build() {
    ref.watch(sessionUserIdProvider);
    ref.onDispose(() => _timer?.cancel());
    return const AcLearnState();
  }

  void begin(int deviceId, AcSlot slot) {
    _timer?.cancel();
    state = AcLearnState(deviceId: deviceId, slot: slot);
    _timer = Timer.periodic(const Duration(seconds: 1), (timer) {
      final current = state;
      if (!current.isLearning || current.secondsLeft <= 1) {
        timer.cancel();
      }
      if (current.isLearning) {
        state = AcLearnState(
          deviceId: current.deviceId,
          slot: current.slot,
          secondsLeft: current.secondsLeft <= 1 ? 0 : current.secondsLeft - 1,
        );
      }
    });
  }

  void finish(AcLearnNotice notice) {
    _timer?.cancel();
    _timer = null;
    state = AcLearnState(deviceId: state.deviceId, notice: notice);
  }

  void dismissNotice() {
    if (!state.isLearning) state = const AcLearnState();
  }
}

final acLearnProvider = NotifierProvider<AcLearnNotifier, AcLearnState>(
  AcLearnNotifier.new,
);
