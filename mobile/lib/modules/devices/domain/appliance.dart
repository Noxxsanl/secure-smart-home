import 'device.dart';

/// What a relay drives. The backend only knows "relay" with `turn_on` /
/// `turn_off`, so the kind is guessed from the name the kit (or
/// `npm run hw:register`) gives it — "Đèn phòng khách", "Rèm cửa phòng
/// khách"… — to pick the icon, the state words and the control. A renamed
/// device without a keyword falls back to [ApplianceKind.plainSwitch] and can
/// still be switched (same rule as the web, `@shh/devices` model/appliance).
enum ApplianceKind {
  lamp(label: 'Đèn', on: 'Đang bật', off: 'Đang tắt'),
  fan(label: 'Quạt', on: 'Đang chạy', off: 'Đang tắt'),
  curtain(
    label: 'Rèm cửa',
    on: 'Đang mở',
    off: 'Đang đóng',
    turnOn: 'Mở',
    turnOff: 'Đóng',
  ),
  airConditioner(label: 'Điều hòa', on: 'Đang chạy', off: 'Đang tắt'),
  plainSwitch(label: 'Thiết bị bật/tắt', on: 'Đang bật', off: 'Đang tắt');

  const ApplianceKind({
    required this.label,
    required this.on,
    required this.off,
    this.turnOn = 'Bật',
    this.turnOff = 'Tắt',
  });

  /// Device type shown on the detail page.
  final String label;

  /// State words: "Đang bật" / "Đang tắt", a curtain is "Đang mở" / "Đang đóng".
  final String on;
  final String off;

  /// Verbs for buttons: "Bật" / "Tắt", a curtain is "Mở" / "Đóng".
  final String turnOn;
  final String turnOff;

  String stateOf(bool isOn) => isOn ? on : off;

  static final _curtain = RegExp(r'rèm|curtain|blind', caseSensitive: false);
  static final _airConditioner = RegExp(
    r'điều hoà|điều hòa|máy lạnh|\bac\b|air',
    caseSensitive: false,
  );
  static final _fan = RegExp(r'quạt|\bfan\b', caseSensitive: false);
  static final _lamp = RegExp(r'đèn|light|lamp', caseSensitive: false);

  /// `null` for anything that is not a relay.
  static ApplianceKind? of(CustomerDevice device) {
    if (!device.isRelay) return null;
    final name = device.name;
    if (_curtain.hasMatch(name)) return ApplianceKind.curtain;
    if (_airConditioner.hasMatch(name)) return ApplianceKind.airConditioner;
    if (_fan.hasMatch(name)) return ApplianceKind.fan;
    if (_lamp.hasMatch(name)) return ApplianceKind.lamp;
    return ApplianceKind.plainSwitch;
  }
}
