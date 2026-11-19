import 'package:flutter_test/flutter_test.dart';
import 'package:smart_home_mobile/modules/homes/features/claim/activation_code_formatter.dart';
import 'package:smart_home_mobile/modules/homes/homes.dart';

void main() {
  group('normalizeActivationCode', () {
    test('uppercases, maps O->0 and I/L->1, drops separators', () {
      expect(normalizeActivationCode('q4zt-6mjk-1psx'), 'Q4ZT6MJK1PSX');
      expect(normalizeActivationCode('OIL0 il o'), '0110110');
      expect(normalizeActivationCode(' 7k2m 9qxa/4tpb '), '7K2M9QXA4TPB');
    });

    test('drops accented letters instead of keeping them', () {
      expect(normalizeActivationCode('Ạ-B'), 'B');
    });
  });

  group('formatActivationCode', () {
    test('dash after every 4 characters, max 12, no trailing dash', () {
      expect(formatActivationCode('q4zt'), 'Q4ZT');
      expect(formatActivationCode('q4zt6'), 'Q4ZT-6');
      expect(formatActivationCode('q4zt6mjk1psx'), 'Q4ZT-6MJK-1PSX');
      expect(formatActivationCode('q4zt6mjk1psxEXTRA'), 'Q4ZT-6MJK-1PSX');
    });

    test('formatter applies O->0 / I,L->1 while typing', () {
      const formatter = ActivationCodeInputFormatter();
      final result = formatter.formatEditUpdate(
        TextEditingValue.empty,
        const TextEditingValue(text: 'oil7k2m9'),
      );
      expect(result.text, '0117-K2M9');
      expect(result.selection.baseOffset, result.text.length);
    });
  });

  group('isValidActivationCode', () {
    test('accepts 12 Crockford characters in any format', () {
      expect(isValidActivationCode('7K2M-9QXA-4TPB'), isTrue);
      expect(isValidActivationCode('7k2m9qxa4tpb'), isTrue);
    });

    test('rejects wrong length or characters outside the alphabet', () {
      expect(isValidActivationCode('7K2M-9QXA'), isFalse);
      expect(isValidActivationCode('7K2M-9QXA-4TPBX'), isFalse);
      expect(isValidActivationCode('7K2U-9QXA-4TPB'), isFalse);
      expect(isValidActivationCode(''), isFalse);
    });
  });

  group('isSmartHomeQr', () {
    test('only payloads starting with SH1: are Smart Home QR codes', () {
      expect(isSmartHomeQr('SH1:Q4ZT6MJK1PSX:0123456789abcdef'), isTrue);
      expect(isSmartHomeQr('  SH1:Q4ZT6MJK1PSX:0123456789abcdef\n'), isTrue);
      expect(isSmartHomeQr('https://example.com'), isFalse);
      expect(isSmartHomeQr('Q4ZT-6MJK-1PSX'), isFalse);
      expect(isSmartHomeQr('sh1:abc'), isFalse);
      expect(isSmartHomeQr(''), isFalse);
    });
  });
}
