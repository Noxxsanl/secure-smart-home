import 'package:flutter/material.dart';

/// Tappable options of a question the Assistant asks back (and the example
/// sentences of an empty conversation). Tapping one sends it as typed.
class ClarifyChips extends StatelessWidget {
  const ClarifyChips({
    super.key,
    required this.options,
    required this.onPick,
    this.enabled = true,
  });

  final List<String> options;
  final ValueChanged<String> onPick;
  final bool enabled;

  @override
  Widget build(BuildContext context) {
    if (options.isEmpty) return const SizedBox.shrink();
    return Padding(
      padding: const EdgeInsets.only(left: 36),
      child: Wrap(
        spacing: 8,
        runSpacing: 6,
        children: [
          for (final option in options)
            ActionChip(
              key: ValueKey('chip-$option'),
              label: Text(option),
              onPressed: enabled ? () => onPick(option) : null,
            ),
        ],
      ),
    );
  }
}
