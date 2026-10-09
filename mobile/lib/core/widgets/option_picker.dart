import 'package:flutter/material.dart';

import '../theme/app_theme.dart';

class PickerOption<T> {
  const PickerOption({required this.value, required this.label, this.subtitle});

  final T value;
  final String label;
  final String? subtitle;
}

/// Bottom sheet with a single-choice list. Returns the picked value or `null`.
Future<T?> showOptionSheet<T>(
  BuildContext context, {
  required String title,
  required List<PickerOption<T>> options,
  T? selected,
}) {
  return showModalBottomSheet<T>(
    context: context,
    backgroundColor: AppColors.background,
    isScrollControlled: true,
    shape: const RoundedRectangleBorder(
      borderRadius: BorderRadius.vertical(top: Radius.circular(24)),
    ),
    builder: (context) => SafeArea(
      child: ConstrainedBox(
        constraints: BoxConstraints(
          maxHeight: MediaQuery.sizeOf(context).height * 0.7,
        ),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Padding(
              padding: const EdgeInsets.fromLTRB(20, 20, 20, 8),
              child: Text(
                title,
                style: const TextStyle(
                  fontSize: 18,
                  fontWeight: FontWeight.bold,
                ),
              ),
            ),
            Flexible(
              child: ListView(
                shrinkWrap: true,
                padding: const EdgeInsets.only(bottom: 12),
                children: [
                  for (final option in options)
                    ListTile(
                      title: Text(option.label),
                      subtitle: option.subtitle == null
                          ? null
                          : Text(option.subtitle!),
                      trailing: option.value == selected
                          ? const Icon(Icons.check, color: AppColors.primary)
                          : null,
                      onTap: () => Navigator.of(context).pop(option.value),
                    ),
                ],
              ),
            ),
          ],
        ),
      ),
    ),
  );
}

/// Form field that opens [showOptionSheet]; integrates with [Form] validation.
class PickerField<T> extends FormField<T> {
  PickerField({
    super.key,
    required String label,
    required List<PickerOption<T>> options,
    required T? value,
    required ValueChanged<T> onChanged,
    String? hint,
    IconData? icon,
    super.validator,
    super.enabled,
  }) : super(
         initialValue: value,
         builder: (state) {
           final context = state.context;
           final enabled = state.widget.enabled;
           PickerOption<T>? current;
           for (final option in options) {
             if (option.value == value) current = option;
           }
           return InkWell(
             borderRadius: BorderRadius.circular(14),
             onTap: enabled
                 ? () async {
                     final picked = await showOptionSheet<T>(
                       context,
                       title: label,
                       options: options,
                       selected: value,
                     );
                     if (picked != null) {
                       state.didChange(picked);
                       onChanged(picked);
                     }
                   }
                 : null,
             child: InputDecorator(
               decoration: InputDecoration(
                 labelText: label,
                 errorText: state.errorText,
                 prefixIcon: icon == null ? null : Icon(icon),
                 suffixIcon: const Icon(Icons.expand_more),
               ),
               isEmpty: current == null,
               child: Text(
                 current?.label ?? hint ?? '',
                 style: const TextStyle(color: AppColors.textPrimary),
                 overflow: TextOverflow.ellipsis,
               ),
             ),
           );
         },
       );

  @override
  FormFieldState<T> createState() => _PickerFieldState<T>();
}

/// Keeps the field in sync when the parent supplies a new [value].
class _PickerFieldState<T> extends FormFieldState<T> {
  @override
  void didUpdateWidget(covariant PickerField<T> oldWidget) {
    super.didUpdateWidget(oldWidget);
    final next = (widget as PickerField<T>).initialValue;
    if (next != value) setValue(next);
  }
}
