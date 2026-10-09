/// Activation code helpers (FR-3.1, FR-3.2, contract §4.2 `POST /claim`).
library;

/// Crockford base-32 alphabet used by the backend (no I, L, O, U).
const activationCodeAlphabet = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';

/// Every activation code has 12 characters (`XXXX-XXXX-XXXX`).
const activationCodeLength = 12;

/// QR payloads start with `SH1:` (`SH1:<12 chars>:<sig16>`); the signature is
/// verified by the server only.
const smartHomeQrPrefix = 'SH1:';

/// Uppercases, maps `O→0`, `I/L→1` and drops everything that is not `0-9A-Z`
/// (dashes, spaces, accents). Mirrors the backend normalisation.
String normalizeActivationCode(String input) {
  final buffer = StringBuffer();
  for (final rune in input.toUpperCase().runes) {
    var char = String.fromCharCode(rune);
    if (char == 'O') {
      char = '0';
    } else if (char == 'I' || char == 'L') {
      char = '1';
    }
    final unit = char.codeUnitAt(0);
    final isDigit = unit >= 0x30 && unit <= 0x39;
    final isLetter = unit >= 0x41 && unit <= 0x5A;
    if (char.length == 1 && (isDigit || isLetter)) buffer.write(char);
  }
  return buffer.toString();
}

/// Live-typing formatter: normalises, caps at 12 characters and inserts a dash
/// after every 4 (`Q4ZT6M` → `Q4ZT-6M`). No trailing dash, so Backspace works.
String formatActivationCode(String input) {
  var code = normalizeActivationCode(input);
  if (code.length > activationCodeLength) {
    code = code.substring(0, activationCodeLength);
  }
  final groups = <String>[];
  for (var i = 0; i < code.length; i += 4) {
    groups.add(code.substring(i, i + 4 > code.length ? code.length : i + 4));
  }
  return groups.join('-');
}

/// True when [input] normalises to 12 characters of the Crockford alphabet.
bool isValidActivationCode(String input) {
  final code = normalizeActivationCode(input);
  if (code.length != activationCodeLength) return false;
  return code.split('').every(activationCodeAlphabet.contains);
}

/// FR-3.1: a scanned value is a Smart Home QR when it starts with `SH1:`.
/// Anything else must be rejected with "Mã QR không phải của Smart Home".
bool isSmartHomeQr(String payload) =>
    payload.trim().startsWith(smartHomeQrPrefix);
