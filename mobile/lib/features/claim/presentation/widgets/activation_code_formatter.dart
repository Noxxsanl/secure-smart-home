import 'package:flutter/services.dart';

import '../../domain/claim_code.dart';

/// Live formatter for manual activation-code entry (FR-3.2): uppercases,
/// maps O→0 and I/L→1, drops other characters and inserts dashes after every
/// 4 characters (`XXXX-XXXX-XXXX`).
class ActivationCodeInputFormatter extends TextInputFormatter {
  const ActivationCodeInputFormatter();

  @override
  TextEditingValue formatEditUpdate(
    TextEditingValue oldValue,
    TextEditingValue newValue,
  ) {
    final formatted = formatActivationCode(newValue.text);
    return TextEditingValue(
      text: formatted,
      selection: TextSelection.collapsed(offset: formatted.length),
    );
  }
}
