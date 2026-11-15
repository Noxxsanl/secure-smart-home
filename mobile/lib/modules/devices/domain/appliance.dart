import 'device.dart';

/// What a relay drives. The backend gives each relay an `appliance`
/// (`lamp|fan|curtain|ac`, or `null` for data created before the field
/// existed); only then are the extra commands (`set_pos`, `set_temp`,
/// `learn_code`) and the one-off schedule accepted. When it is missing the kind
/// is guessed from the name the kit (or `npm run hw:register`) gives it —
/// "Đèn phòng khách", "Rèm cửa phòng khách"… — to pick the icon and the state
/// words; such a device can only be switched on/off. A renamed device without a
/// keyword falls back to [ApplianceKind.plainSwitch] (same rule as the web,
/// `@shh/devices` model/appliance).
enum ApplianceKind {
  lamp(label: 'Đèn', on: 'Đang bật', off: 'Đang tắt', apiValue: 'lamp'),
  fan(label: 'Quạt', on: 'Đang chạy', off: 'Đang tắt', apiValue: 'fan'),
  curtain(
    label: 'Rèm cửa',
    on: 'Đang mở',
    off: 'Đang đóng',
    turnOn: 'Mở',
    turnOff: 'Đóng',
    apiValue: 'curtain',
  ),
  airConditioner(
    label: 'Điều hòa',
    on: 'Đang chạy',
    off: 'Đang tắt',
    apiValue: 'ac',
  ),
  plainSwitch(label: 'Thiết bị bật/tắt', on: 'Đang bật', off: 'Đang tắt');

  const ApplianceKind({
    required this.label,
    required this.on,
    required this.off,
    this.turnOn = 'Bật',
    this.turnOff = 'Tắt',
    this.apiValue,
  });

  /// Device type shown on the detail page.
  final String label;

  /// State words: "Đang bật" / "Đang tắt", a curtain is "Đang mở" / "Đang đóng".
  final String on;
  final String off;

  /// Verbs for buttons: "Bật" / "Tắt", a curtain is "Mở" / "Đóng".
  final String turnOn;
  final String turnOff;

  /// Value of `appliance` in the API; `null` for [plainSwitch] (never sent).
  final String? apiValue;

  String stateOf(bool isOn) => isOn ? on : off;

  /// Kinds the backend accepts a one-off schedule for.
  bool get isSchedulable => apiValue != null;

  /// `lamp|fan|curtain|ac` → kind; anything else (including `null`) → `null`,
  /// meaning "the backend has not assigned one".
  static ApplianceKind? fromApi(String? value) {
    for (final kind in values) {
      if (kind.apiValue != null && kind.apiValue == value) return kind;
    }
    return null;
  }

  static final _curtain = RegExp(r'rèm|curtain|blind', caseSensitive: false);
  static final _airConditioner = RegExp(
    r'điều hoà|điều hòa|máy lạnh|\bac\b|air',
    caseSensitive: false,
  );
  static final _fan = RegExp(r'quạt|\bfan\b', caseSensitive: false);
  static final _lamp = RegExp(r'đèn|light|lamp', caseSensitive: false);

  /// Guess from a device name; [plainSwitch] when no keyword matches.
  static ApplianceKind guessFromName(String name) {
    if (_curtain.hasMatch(name)) return ApplianceKind.curtain;
    if (_airConditioner.hasMatch(name)) return ApplianceKind.airConditioner;
    if (_fan.hasMatch(name)) return ApplianceKind.fan;
    if (_lamp.hasMatch(name)) return ApplianceKind.lamp;
    return ApplianceKind.plainSwitch;
  }

  /// `null` for anything that is not a relay. The backend's `appliance` wins;
  /// the name is only a fallback for relays it has not classified yet.
  static ApplianceKind? of(CustomerDevice device) {
    if (!device.isRelay) return null;
    return device.appliance ?? guessFromName(device.name);
  }
}

/// Set point range of an air conditioner (`set_temp`), 1 °C steps.
const acSetpointMin = 16;
const acSetpointMax = 30;

/// Where −/+ start from when the backend does not know the set point yet.
const acSetpointStart = 26;

int clampSetpoint(int value) => value < acSetpointMin
    ? acSetpointMin
    : (value > acSetpointMax ? acSetpointMax : value);
