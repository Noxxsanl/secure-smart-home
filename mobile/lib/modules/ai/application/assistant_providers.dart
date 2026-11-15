import 'dart:async';

import 'package:flutter/foundation.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/config/app_config.dart';
import '../../../core/network/network_providers.dart';
import '../../../mock/mock_providers.dart';
import '../../auth/auth.dart';
import '../../automation/automation.dart';
import '../../homes/homes.dart';
import '../../notifications/notifications.dart';
import '../data/assistant_mock_repository.dart';
import '../data/assistant_remote_repository.dart';
import '../domain/agent_reply.dart';
import '../domain/assistant_repository.dart';
import '../domain/assistant_texts.dart';
import '../domain/chat_entry.dart';
import 'assistant_errors.dart';

final assistantRepositoryProvider = Provider<AssistantRepository>((ref) {
  final config = ref.watch(appConfigProvider);
  if (config.useMock) {
    return MockAssistantRepository(ref.watch(mockBackendProvider));
  }
  return RemoteAssistantRepository(
    ref.watch(apiClientProvider),
    agentBaseUrl: config.agentBaseUrl,
  );
});

/// "Now" for the countdown of a pending card; the mock backend's clock under
/// `USE_MOCK`, so tests can move time.
final assistantClockProvider = Provider<DateTime Function()>((ref) {
  if (ref.watch(appConfigProvider).useMock) {
    return ref.watch(mockBackendProvider).clock;
  }
  return DateTime.now;
});

@immutable
class AssistantChatState {
  const AssistantChatState({
    this.entries = const [],
    this.busy = false,
    this.cancellingId,
    this.conversationId,
  });

  final List<ChatEntry> entries;

  /// Waiting for the Assistant to answer.
  final bool busy;

  /// Schedule whose cancel request is in flight.
  final int? cancellingId;

  /// Kept between messages so the agent remembers the conversation.
  final String? conversationId;

  AssistantChatState copyWith({
    List<ChatEntry>? entries,
    bool? busy,
    int? Function()? cancellingId,
    String? Function()? conversationId,
  }) => AssistantChatState(
    entries: entries ?? this.entries,
    busy: busy ?? this.busy,
    cancellingId: cancellingId == null ? this.cancellingId : cancellingId(),
    conversationId: conversationId == null
        ? this.conversationId
        : conversationId(),
  );
}

/// The conversation with the Assistant for one home. It lives in memory only —
/// no speech, no audio and no sentence is stored — and survives closing the
/// sheet; it is dropped when another user signs in.
class AssistantChatNotifier extends Notifier<AssistantChatState> {
  AssistantChatNotifier(this.homeId);

  final int homeId;
  var _nextId = 1;

  /// Bumped on every (re)build — e.g. another user signed in. A reply that
  /// arrives for an older generation is dropped, so it can never land in the
  /// next user's conversation even if this instance survives the rebuild.
  var _generation = 0;

  @override
  AssistantChatState build() {
    ref.watch(sessionUserIdProvider);
    _generation++;
    return const AssistantChatState();
  }

  /// `true` when the work started at [generation] must not touch [state].
  bool _isStale(int generation) => !ref.mounted || generation != _generation;

  AssistantRepository get _repository => ref.read(assistantRepositoryProvider);

  int _newId() => _nextId++;

  void _push(ChatEntry entry) =>
      state = state.copyWith(entries: [...state.entries, entry]);

  void _patch(int id, ChatEntry Function(ChatEntry entry) change) {
    state = state.copyWith(
      entries: [
        for (final entry in state.entries)
          entry.id == id ? change(entry) : entry,
      ],
    );
  }

  void _setOutcome(int entryId, PendingOutcome outcome) => _patch(
    entryId,
    (entry) =>
        entry is AssistantEntry ? entry.copyWith(outcome: outcome) : entry,
  );

  /// After the Assistant changed something: refresh what the rest of the app
  /// shows instead of waiting for polling (device states, notifications and
  /// the "Hẹn giờ" lists — every orchestrated step is a `scheduled_actions` row).
  void _refreshHome() {
    if (ref.exists(homeOverviewProvider(homeId))) {
      unawaited(ref.read(homeOverviewProvider(homeId).notifier).refresh());
    }
    if (ref.exists(notificationsProvider)) {
      unawaited(ref.read(notificationsProvider.notifier).refresh());
    }
    invalidateSchedules(ref, homeId);
  }

  Future<void> _ask(
    Future<AgentReply> Function() call,
    int userEntryId, {
    required bool voice,
  }) async {
    final generation = _generation;
    state = state.copyWith(busy: true);
    try {
      final reply = await call();
      if (_isStale(generation)) return;
      if (voice) {
        final heard = reply.transcript?.trim();
        _patch(
          userEntryId,
          (e) => e is UserEntry
              ? e.withText(
                  heard == null || heard.isEmpty ? voiceMessageFallback : heard,
                )
              : e,
        );
      }
      _push(
        AssistantEntry(
          id: _newId(),
          reply: reply,
          scheduled: reply.scheduled,
          outcome: reply.pending == null ? null : const PendingOpen(),
        ),
      );
      state = state.copyWith(
        conversationId: reply.conversationId.isEmpty
            ? null
            : () => reply.conversationId,
      );
      if (reply.executed.isNotEmpty ||
          reply.scheduled.isNotEmpty ||
          reply.pending != null) {
        _refreshHome();
      }
    } on Object catch (error) {
      if (_isStale(generation)) return;
      if (voice) {
        _patch(
          userEntryId,
          (e) => e is UserEntry ? e.withText(voiceMessageFallback) : e,
        );
      }
      _push(
        ErrorEntry(
          id: _newId(),
          text: assistantErrorMessage(error, voice: voice),
        ),
      );
      // A clear command runs on the backend before the reply is sent: after a
      // timeout or a dropped connection it may already have run, so show the
      // real device states and schedules before the user says it again.
      _refreshHome();
    } finally {
      if (!_isStale(generation)) state = state.copyWith(busy: false);
    }
  }

  /// A typed message (or a tapped chip / example).
  Future<void> sendText(String raw) async {
    final text = raw.trim();
    if (text.isEmpty || state.busy) return;
    final clipped = text.length > textMaxLength
        ? text.substring(0, textMaxLength)
        : text;
    final id = _newId();
    _push(UserEntry(id: id, text: clipped));
    final conversationId = state.conversationId;
    await _ask(
      () =>
          _repository.sendText(homeId, clipped, conversationId: conversationId),
      id,
      voice: false,
    );
  }

  /// A finished voice recording.
  Future<void> sendVoice(RecordedAudio audio) async {
    if (state.busy) return;
    if (audio.bytes.length > audioMaxBytes) {
      _push(ErrorEntry(id: _newId(), text: MicErrors.tooLarge));
      return;
    }
    final id = _newId();
    _push(UserEntry(id: id, voice: true));
    final conversationId = state.conversationId;
    await _ask(
      () =>
          _repository.sendVoice(homeId, audio, conversationId: conversationId),
      id,
      voice: true,
    );
  }

  /// Confirms the chosen steps of a pending card. Only an open card acts: a
  /// second tap while the first request is in flight (or after the card was
  /// answered) is ignored, so it cannot overwrite the real outcome.
  Future<void> confirm(int entryId, List<int> stepIndexes) async {
    final pending = _openPendingOf(entryId);
    if (pending == null || stepIndexes.isEmpty) return;
    final generation = _generation;
    _setOutcome(entryId, const PendingConfirming());
    try {
      final result = await _repository.confirm(
        pending.requestId,
        pending.requestHash,
        stepIndexes,
      );
      if (_isStale(generation)) return;
      _setOutcome(entryId, PendingDone(result.results));
      _refreshHome();
    } on Object catch (error) {
      if (_isStale(generation)) return;
      _setOutcome(entryId, _failedOutcome(error));
    }
  }

  /// Declines a pending request altogether (open cards only, see [confirm]).
  Future<void> reject(int entryId) async {
    final pending = _openPendingOf(entryId);
    if (pending == null) return;
    final generation = _generation;
    _setOutcome(entryId, const PendingRejecting());
    try {
      await _repository.reject(pending.requestId);
      if (_isStale(generation)) return;
      _setOutcome(entryId, const PendingRejected());
    } on Object catch (error) {
      if (_isStale(generation)) return;
      _setOutcome(entryId, _failedOutcome(error));
    }
  }

  PendingOutcome _failedOutcome(Object error) {
    final message = confirmErrorMessage(error);
    return isStaleRequestError(error)
        ? PendingStale(message)
        : PendingOpen(error: message);
  }

  /// The pending request of [entryId] while its card still accepts an answer
  /// ([PendingOpen], including a retryable error); `null` otherwise.
  AgentPending? _openPendingOf(int entryId) {
    for (final entry in state.entries) {
      if (entry.id == entryId && entry is AssistantEntry) {
        return entry.outcome is PendingOpen ? entry.reply.pending : null;
      }
    }
    return null;
  }

  /// Cancels a schedule the Assistant created. Returns a Vietnamese error
  /// sentence, or `null` on success.
  Future<String?> cancelSchedule(int scheduleId) async {
    final generation = _generation;
    state = state.copyWith(cancellingId: () => scheduleId);
    try {
      final updated = await _repository.cancelSchedule(scheduleId);
      if (_isStale(generation)) return null;
      state = state.copyWith(
        entries: [
          for (final entry in state.entries)
            entry is AssistantEntry
                ? entry.copyWith(
                    scheduled: [
                      for (final s in entry.scheduled)
                        s.id == updated.id ? updated : s,
                    ],
                  )
                : entry,
        ],
      );
      _refreshHome();
      return null;
    } on Object catch (error) {
      if (!_isStale(generation)) _refreshHome();
      return cancelErrorMessage(error);
    } finally {
      if (!_isStale(generation)) {
        state = state.copyWith(cancellingId: () => null);
      }
    }
  }

  /// Starts over: forgets the conversation id and clears the bubbles (the
  /// schedules already made stay in the schedule list).
  void reset() {
    if (state.busy) return;
    state = const AssistantChatState();
  }
}

final assistantChatProvider =
    NotifierProvider.family<AssistantChatNotifier, AssistantChatState, int>(
      AssistantChatNotifier.new,
    );
