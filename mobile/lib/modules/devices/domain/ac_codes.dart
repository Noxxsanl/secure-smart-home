import 'package:flutter/foundation.dart';

import 'appliance.dart';

/// One of the 16 IR codes the Node learns from the real remote: "TẮT" plus one
/// per set point 16..30 °C (same grid as the Node's touch screen).
@immutable
class AcSlot {
  const AcSlot._(this.temperature);

  /// The OFF code.
  static const off = AcSlot._(null);

  /// The code of [temperature] °C (16..30).
  factory AcSlot.temp(int temperature) {
    assert(temperature >= acSetpointMin && temperature <= acSetpointMax);
    return AcSlot._(clampSetpoint(temperature));
  }

  /// `null` for [off].
  final int? temperature;

  bool get isOff => temperature == null;

  /// `"off"` or the temperature, as `learn_code` sends it.
  Object get apiValue => temperature ?? 'off';

  String get label => isOff ? 'TẮT' : '$temperature°C';

  /// Position in the `ac_codes` bitmask: bit 0 = OFF, bit (t − 15) = t °C.
  int get bit => isOff ? 0 : temperature! - acSetpointMin + 1;

  /// "off" or 16..30 → slot; anything else → `null`.
  static AcSlot? fromApi(Object? value) {
    if (value == 'off') return off;
    if (value is int && value >= acSetpointMin && value <= acSetpointMax) {
      return AcSlot.temp(value);
    }
    return null;
  }

  @override
  bool operator ==(Object other) =>
      other is AcSlot && other.temperature == temperature;

  @override
  int get hashCode => temperature.hashCode;

  @override
  String toString() => 'AcSlot($label)';
}

/// All 16 slots in grid order: TẮT, 16 … 30.
final acSlots = List<AcSlot>.unmodifiable([
  AcSlot.off,
  for (var t = acSetpointMin; t <= acSetpointMax; t++) AcSlot.temp(t),
]);

/// How long the Node waits for the user to press the remote when learning.
const learnWindowSeconds = 10;

/// `true`/`false` per the bitmask the Node reported; `null` when the Node has
/// not reported it yet (unknown).
bool? isSlotLearned(int? codes, AcSlot slot) {
  if (codes == null) return null;
  return ((codes >> slot.bit) & 1) == 1;
}

/// How many of the 16 codes are learned; `null` when unknown.
int? learnedCount(int? codes) {
  if (codes == null) return null;
  return acSlots.where((slot) => isSlotLearned(codes, slot) == true).length;
}

/// Bitmask with exactly [slots] set (used by the mock and tests).
int acCodesMask(Iterable<AcSlot> slots) =>
    slots.fold(0, (mask, slot) => mask | (1 << slot.bit));

/// What to do with the remote while the Node is listening.
String learnInstruction(AcSlot slot) {
  const aim = 'Chĩa remote vào mắt thu trên Node (cách 5–20 cm)';
  return slot.isOff
      ? '$aim, rồi bấm nút nguồn khi điều hòa đang bật.'
      : '$aim, chỉnh remote về chế độ Lạnh + đúng ${slot.temperature}°C rồi bấm 1 lần.';
}

/// Result of the last learn attempt, shown inside the panel.
@immutable
class AcLearnNotice {
  const AcLearnNotice.success(this.text) : success = true;
  const AcLearnNotice.failure(this.text) : success = false;

  final bool success;
  final String text;
}

String learnSuccessText(AcSlot slot) =>
    'Đã học mã ${slot.label}. Bạn có thể bấm ô này để phát mã.';
