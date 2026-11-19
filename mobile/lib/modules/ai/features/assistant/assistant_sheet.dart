import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../../core/theme/app_theme.dart';
import '../../application/assistant_providers.dart';
import '../../application/assistant_errors.dart';
import '../../application/voice_recorder_controller.dart';
import '../../domain/assistant_schedule.dart';
import '../../domain/assistant_texts.dart';
import '../../domain/chat_entry.dart';
import '../../domain/voice_recorder.dart';
import '../../ui/chat_bubble.dart';
import '../../ui/clarify_chips.dart';
import '../../ui/executed_list.dart';
import '../../ui/hold_to_talk_mic.dart';
import '../../ui/pending_card.dart';
import '../../ui/rejected_list.dart';
import '../../ui/scheduled_list.dart';

/// Opens the Assistant for [homeId] as a tall bottom sheet. The conversation
/// lives in [assistantChatProvider], so closing and reopening the sheet keeps
/// the bubbles and the pending cards.
Future<void> showAssistantSheet(
  BuildContext context, {
  required int homeId,
  required String timezone,
}) {
  return showModalBottomSheet<void>(
    context: context,
    isScrollControlled: true,
    useSafeArea: true,
    showDragHandle: true,
    backgroundColor: AppColors.background,
    builder: (_) => FractionallySizedBox(
      heightFactor: 0.94,
      child: AssistantSheet(homeId: homeId, timezone: timezone),
    ),
  );
}

/// The Assistant conversation: bubbles, the blocks under each answer, a mic
/// button and a text box. All real decisions (permissions, whether a command
/// is clear enough to run at once) are the backend's.
class AssistantSheet extends ConsumerStatefulWidget {
  const AssistantSheet({
    super.key,
    required this.homeId,
    required this.timezone,
  });

  final int homeId;

  /// IANA timezone of the home (step times carry none).
  final String timezone;

  @override
  ConsumerState<AssistantSheet> createState() => _AssistantSheetState();
}

class _AssistantSheetState extends ConsumerState<AssistantSheet> {
  final _text = TextEditingController();
  final _scroll = ScrollController();

  /// Guidance from the mic ("Giữ nút mic để nói"), shown in place of the idle
  /// caption until the next recording starts.
  String? _micHint;

  @override
  void dispose() {
    _text.dispose();
    _scroll.dispose();
    super.dispose();
  }

  AssistantChatNotifier get _chat =>
      ref.read(assistantChatProvider(widget.homeId).notifier);

  void _scrollToEnd() {
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (!mounted || !_scroll.hasClients) return;
      _scroll.animateTo(
        _scroll.position.maxScrollExtent,
        duration: const Duration(milliseconds: 200),
        curve: Curves.easeOut,
      );
    });
  }

  void _submit() {
    final value = _text.text.trim();
    final state = ref.read(assistantChatProvider(widget.homeId));
    final recorder = ref.read(voiceRecorderControllerProvider);
    if (value.isEmpty || state.busy || recorder.phase != RecorderPhase.idle) {
      return;
    }
    _text.clear();
    setState(() => _micHint = null);
    _chat.sendText(value);
  }

  Future<void> _cancelSchedule(AssistantSchedule schedule) async {
    final error = await _chat.cancelSchedule(schedule.id);
    if (!mounted) return;
    final messenger = ScaffoldMessenger.maybeOf(context);
    messenger
      ?..hideCurrentSnackBar()
      ..showSnackBar(
        SnackBar(
          content: Text(error ?? 'Đã huỷ hẹn giờ.'),
          backgroundColor: error == null ? null : AppColors.critical,
        ),
      );
  }

  @override
  Widget build(BuildContext context) {
    final chat = ref.watch(assistantChatProvider(widget.homeId));
    final recorder = ref.watch(voiceRecorderControllerProvider);
    final clock = ref.watch(assistantClockProvider);
    ref.listen(
      assistantChatProvider(
        widget.homeId,
      ).select((s) => (s.entries.length, s.busy)),
      (_, _) => _scrollToEnd(),
    );

    ref.listen(voiceRecorderControllerProvider.select((s) => s.phase), (
      _,
      phase,
    ) {
      if (phase != RecorderPhase.idle && _micHint != null) {
        setState(() => _micHint = null);
      }
    });

    final recording = recorder.isRecording;
    final now = clock();
    final textTheme = Theme.of(context).textTheme;
    final muted = textTheme.bodySmall?.copyWith(color: AppColors.textSecondary);
    final caption = switch (recorder.phase) {
      RecorderPhase.starting => 'Đang chờ bạn cho phép micro…',
      RecorderPhase.recording =>
        'Đang nghe… ${formatRecordClock(recorder.seconds)} / '
            '${formatRecordClock(maxRecordSeconds)} — thả tay để gửi, kéo ra '
            'xa để huỷ',
      RecorderPhase.idle =>
        chat.busy
            ? 'Đang xử lý…'
            : _micHint ?? 'Giữ nút mic để nói, hoặc gõ chữ bên dưới',
    };

    return ScaffoldMessenger(
      child: Scaffold(
        backgroundColor: Colors.transparent,
        body: Column(
          children: [
            Padding(
              padding: const EdgeInsets.fromLTRB(20, 0, 8, 4),
              child: Row(
                children: [
                  const Icon(
                    Icons.auto_awesome,
                    size: 18,
                    color: AppColors.primary,
                  ),
                  const SizedBox(width: 8),
                  Expanded(
                    child: Text(
                      'Trợ lý AI',
                      style: textTheme.titleMedium?.copyWith(
                        fontWeight: FontWeight.w700,
                      ),
                    ),
                  ),
                  IconButton(
                    key: const ValueKey('assistant-reset'),
                    tooltip: 'Cuộc trò chuyện mới',
                    onPressed: chat.busy || chat.entries.isEmpty
                        ? null
                        : () => _chat.reset(),
                    icon: const Icon(Icons.restart_alt),
                  ),
                  IconButton(
                    key: const ValueKey('assistant-close'),
                    tooltip: 'Đóng Trợ lý AI',
                    onPressed: () => Navigator.of(context).maybePop(),
                    icon: const Icon(Icons.close),
                  ),
                ],
              ),
            ),
            Padding(
              padding: const EdgeInsets.symmetric(horizontal: 20),
              child: Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  const Icon(
                    Icons.info_outline,
                    size: 14,
                    color: AppColors.textSecondary,
                  ),
                  const SizedBox(width: 6),
                  Expanded(child: Text(openAiNotice, style: muted)),
                ],
              ),
            ),
            const SizedBox(height: 8),
            Expanded(
              child: ListView(
                controller: _scroll,
                padding: const EdgeInsets.fromLTRB(16, 8, 16, 16),
                children: [
                  if (chat.entries.isEmpty) ..._emptyState(muted),
                  for (final entry in chat.entries)
                    Padding(
                      padding: const EdgeInsets.only(bottom: 12),
                      child: _entry(entry, chat, now, recording),
                    ),
                  if (chat.busy)
                    Padding(
                      padding: const EdgeInsets.only(left: 36),
                      child: Row(
                        key: const ValueKey('assistant-busy'),
                        children: [
                          const SizedBox(
                            width: 14,
                            height: 14,
                            child: CircularProgressIndicator(strokeWidth: 2),
                          ),
                          const SizedBox(width: 8),
                          Text('Đang xử lý…', style: muted),
                        ],
                      ),
                    ),
                ],
              ),
            ),
            _footer(chat.busy, recorder, caption, muted),
          ],
        ),
      ),
    );
  }

  List<Widget> _emptyState(TextStyle? muted) => [
    const ChatBubble(role: ChatBubbleRole.assistant, text: assistantGreeting),
    const SizedBox(height: 8),
    ClarifyChips(
      options: examplePrompts,
      onPick: (option) => _chat.sendText(option),
    ),
    Padding(
      padding: const EdgeInsets.fromLTRB(36, 8, 0, 8),
      child: Text(assistantHint, style: muted),
    ),
  ];

  Widget _entry(
    ChatEntry entry,
    AssistantChatState chat,
    DateTime now,
    bool recording,
  ) {
    switch (entry) {
      case UserEntry():
        return ChatBubble(
          role: ChatBubbleRole.user,
          voice: entry.voice,
          text: entry.text ?? 'Đang nhận dạng giọng nói…',
        );
      case ErrorEntry():
        return ChatBubble(role: ChatBubbleRole.error, text: entry.text);
      case AssistantEntry():
        final reply = entry.reply;
        final question = reply.clarification?.question ?? '';
        var message = reply.reply.isNotEmpty ? reply.reply : question;
        if (question.isNotEmpty &&
            message.isNotEmpty &&
            !message.contains(question)) {
          message = '$message\n$question';
        }
        final isLast = identical(entry, chat.entries.last);
        final options = reply.clarification?.options ?? const <String>[];
        final pending = reply.pending;
        final outcome = entry.outcome;
        return Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            if (message.isNotEmpty)
              ChatBubble(role: ChatBubbleRole.assistant, text: message),
            if (reply.executed.isNotEmpty) ...[
              const SizedBox(height: 8),
              ExecutedList(executed: reply.executed, now: now),
            ],
            if (entry.scheduled.isNotEmpty) ...[
              const SizedBox(height: 8),
              ScheduledList(
                schedules: entry.scheduled,
                now: now,
                cancellingId: chat.cancellingId,
                onCancel: _cancelSchedule,
              ),
            ],
            if (pending != null && outcome != null) ...[
              const SizedBox(height: 8),
              PendingCard(
                pending: pending,
                outcome: outcome,
                clock: ref.read(assistantClockProvider),
                timezone: widget.timezone,
                onConfirm: (indexes) => _chat.confirm(entry.id, indexes),
                onReject: () => _chat.reject(entry.id),
              ),
            ],
            if (reply.rejected.isNotEmpty) ...[
              const SizedBox(height: 8),
              RejectedList(
                messages: [
                  for (final step in reply.rejected) rejectedMessage(step),
                ],
              ),
            ],
            if (isLast && options.isNotEmpty) ...[
              const SizedBox(height: 8),
              ClarifyChips(
                options: options,
                enabled: !chat.busy && !recording,
                onPick: (option) => _chat.sendText(option),
              ),
            ],
          ],
        );
    }
  }

  Widget _footer(
    bool busy,
    RecorderState recorder,
    String caption,
    TextStyle? muted,
  ) {
    final locked = busy || recorder.phase != RecorderPhase.idle;
    return Material(
      color: AppColors.surface,
      child: SafeArea(
        top: false,
        child: Padding(
          padding: const EdgeInsets.fromLTRB(16, 10, 16, 10),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              if (recorder.error != null)
                Padding(
                  padding: const EdgeInsets.only(bottom: 8),
                  child: Container(
                    key: const ValueKey('assistant-mic-error'),
                    width: double.infinity,
                    padding: const EdgeInsets.all(10),
                    decoration: BoxDecoration(
                      color: AppColors.critical.withValues(alpha: 0.08),
                      borderRadius: BorderRadius.circular(10),
                    ),
                    child: Text(
                      recorder.error!,
                      style: Theme.of(context).textTheme.bodySmall?.copyWith(
                        color: AppColors.critical,
                      ),
                    ),
                  ),
                ),
              Row(
                children: [
                  HoldToTalkMic(
                    key: const ValueKey('mic-button'),
                    homeId: widget.homeId,
                    semanticLabel: 'Giữ để nói',
                    onTap: () => setState(() => _micHint = MicHints.holdToTalk),
                    onAudio: (audio) => _chat.sendVoice(audio),
                    onHint: (message) => setState(() => _micHint = message),
                  ),
                  const SizedBox(width: 12),
                  Expanded(
                    child: Text(
                      caption,
                      key: const ValueKey('assistant-caption'),
                      style: muted,
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 8),
              Row(
                children: [
                  Expanded(
                    child: TextField(
                      key: const ValueKey('assistant-input'),
                      controller: _text,
                      enabled: !locked,
                      maxLength: textMaxLength,
                      buildCounter:
                          (
                            _, {
                            required currentLength,
                            required isFocused,
                            required maxLength,
                          }) => null,
                      textInputAction: TextInputAction.send,
                      onChanged: (_) => setState(() => _micHint = null),
                      onSubmitted: (_) => _submit(),
                      decoration: const InputDecoration(
                        hintText: 'Gõ yêu cầu, ví dụ: 8h tối bật đèn',
                        isDense: true,
                      ),
                    ),
                  ),
                  const SizedBox(width: 8),
                  IconButton.filled(
                    key: const ValueKey('assistant-send'),
                    tooltip: 'Gửi',
                    onPressed: locked || _text.text.trim().isEmpty
                        ? null
                        : _submit,
                    icon: const Icon(Icons.send),
                  ),
                ],
              ),
            ],
          ),
        ),
      ),
    );
  }
}
