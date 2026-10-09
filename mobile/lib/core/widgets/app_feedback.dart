import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../network/error_messages.dart';
import '../theme/app_theme.dart';

/// The root [ScaffoldMessenger] key, so non-widget code (realtime events) can
/// show snackbars too.
final rootMessengerKeyProvider = Provider<GlobalKey<ScaffoldMessengerState>>(
  (ref) => GlobalKey<ScaffoldMessengerState>(),
);

void showAppSnack(
  ScaffoldMessengerState? messenger,
  String message, {
  bool error = false,
  SnackBarAction? action,
  Duration duration = const Duration(seconds: 4),
}) {
  if (messenger == null) return;
  messenger
    ..hideCurrentSnackBar()
    ..showSnackBar(
      SnackBar(
        content: Text(message),
        backgroundColor: error ? AppColors.critical : null,
        action: action,
        duration: duration,
      ),
    );
}

/// Runs [action]; on failure shows the Vietnamese guidance for the error (never
/// the raw code). Returns `true` when the action succeeded.
Future<bool> runAction(
  BuildContext context,
  Future<void> Function() action, {
  ErrorContext errorContext = ErrorContext.general,
  String? successMessage,
}) async {
  final messenger = ScaffoldMessenger.maybeOf(context);
  try {
    await action();
    if (successMessage != null) showAppSnack(messenger, successMessage);
    return true;
  } on Object catch (error) {
    showAppSnack(
      messenger,
      userMessageFor(error, context: errorContext),
      error: true,
    );
    return false;
  }
}

/// Yes/no confirmation. Returns `true` when confirmed.
Future<bool> confirmDialog(
  BuildContext context, {
  required String title,
  required String message,
  String confirmLabel = 'Đồng ý',
  String cancelLabel = 'Huỷ',
  bool destructive = false,
}) async {
  final result = await showDialog<bool>(
    context: context,
    builder: (context) => AlertDialog(
      title: Text(title),
      content: Text(message),
      actions: [
        TextButton(
          onPressed: () => Navigator.of(context).pop(false),
          child: Text(cancelLabel),
        ),
        TextButton(
          onPressed: () => Navigator.of(context).pop(true),
          style: destructive
              ? TextButton.styleFrom(foregroundColor: AppColors.critical)
              : null,
          child: Text(confirmLabel),
        ),
      ],
    ),
  );
  return result ?? false;
}

/// Single-line text prompt (rename dialogs). Returns the trimmed text or
/// `null` when cancelled.
Future<String?> promptText(
  BuildContext context, {
  required String title,
  required String label,
  String initial = '',
  int maxLength = 64,
  String confirmLabel = 'Lưu',
}) {
  return showDialog<String>(
    context: context,
    builder: (context) => _PromptDialog(
      title: title,
      label: label,
      initial: initial,
      maxLength: maxLength,
      confirmLabel: confirmLabel,
    ),
  );
}

class _PromptDialog extends StatefulWidget {
  const _PromptDialog({
    required this.title,
    required this.label,
    required this.initial,
    required this.maxLength,
    required this.confirmLabel,
  });

  final String title;
  final String label;
  final String initial;
  final int maxLength;
  final String confirmLabel;

  @override
  State<_PromptDialog> createState() => _PromptDialogState();
}

class _PromptDialogState extends State<_PromptDialog> {
  late final TextEditingController _controller = TextEditingController(
    text: widget.initial,
  );
  String? _error;

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  void _submit() {
    final text = _controller.text.trim();
    if (text.isEmpty) {
      setState(() => _error = 'Vui lòng nhập ${widget.label.toLowerCase()}.');
      return;
    }
    Navigator.of(context).pop(text);
  }

  @override
  Widget build(BuildContext context) {
    return AlertDialog(
      title: Text(widget.title),
      content: TextField(
        controller: _controller,
        autofocus: true,
        maxLength: widget.maxLength,
        textInputAction: TextInputAction.done,
        onSubmitted: (_) => _submit(),
        decoration: InputDecoration(
          labelText: widget.label,
          errorText: _error,
        ),
      ),
      actions: [
        TextButton(
          onPressed: () => Navigator.of(context).pop(),
          child: const Text('Huỷ'),
        ),
        TextButton(onPressed: _submit, child: Text(widget.confirmLabel)),
      ],
    );
  }
}
