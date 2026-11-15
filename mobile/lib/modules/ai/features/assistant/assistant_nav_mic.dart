import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../../core/theme/app_theme.dart';
import '../../../../core/widgets/app_feedback.dart';
import '../../../homes/homes.dart';
import '../../application/assistant_providers.dart';
import '../../ui/hold_to_talk_mic.dart';
import 'assistant_sheet.dart';

/// The mic in the middle of the bottom navigation bar. A tap opens the
/// Assistant for the home currently selected; holding it records a voice
/// message, and releasing sends it and opens the Assistant to show the answer.
/// Disabled while there is no home.
class AssistantNavMic extends ConsumerWidget {
  const AssistantNavMic({super.key});

  /// Diameter of the round button.
  static const buttonSize = 58.0;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final home = ref.watch(currentHomeProvider);
    final messenger = ScaffoldMessenger.maybeOf(context);

    void open() {
      if (home == null) return;
      unawaited(
        showAssistantSheet(
          context,
          homeId: home.id,
          timezone: home.home.timezone,
        ),
      );
    }

    return Column(
      mainAxisSize: MainAxisSize.min,
      children: [
        HoldToTalkMic(
          key: const ValueKey('assistant-mic'),
          homeId: home?.id,
          size: buttonSize,
          shadow: true,
          showBubble: true,
          semanticLabel: 'Trợ lý — chạm để mở, giữ để nói',
          onTap: open,
          onAudio: (audio) {
            if (home == null) return;
            unawaited(
              ref
                  .read(assistantChatProvider(home.id).notifier)
                  .sendVoice(audio),
            );
            if (context.mounted) open();
          },
          onHint: (message) => showAppSnack(messenger, message),
          onError: (message) => showAppSnack(messenger, message, error: true),
        ),
        const SizedBox(height: 2),
        Text(
          'Trợ lý',
          style: TextStyle(
            fontSize: 11,
            fontWeight: FontWeight.w600,
            color: home == null ? AppColors.offline : AppColors.primary,
          ),
        ),
      ],
    );
  }
}
