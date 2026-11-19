import 'package:flutter/foundation.dart';

import 'ac_codes.dart';
import 'appliance.dart';

/// `action` of `POST /devices/:id/commands`.
enum CommandAction {
  turnOn('turn_on'),
  turnOff('turn_off'),
  setPos('set_pos'),
  setTemp('set_temp'),
  learnCode('learn_code'),

  /// An action this app version does not know (kept instead of being turned
  /// into another one).
  unknown('');

  const CommandAction(this.apiValue);

  final String apiValue;

  static CommandAction fromApi(String? value) {
    for (final action in values) {
      if (action != unknown && action.apiValue == value) return action;
    }
    return unknown;
  }

  static CommandAction forPower(bool on) => on ? turnOn : turnOff;
}

/// A command for one device (contract §1):
/// - `turn_on` / `turn_off`: any relay (a curtain goes to 100 % / 0 %);
/// - `set_pos` 0..100: curtains only;
/// - `set_temp` 16..30: air conditioners only (turns an idle one on);
/// - `learn_code` `"off"` | 16..30: air conditioners only; the Node waits up to
///   10 s for the user to press the remote, the server up to 15 s.
@immutable
class DeviceCommand {
  const DeviceCommand._(
    this.action, {
    this.position,
    this.temperature,
    this.slot,
  });

  const DeviceCommand.turnOn() : this._(CommandAction.turnOn);
  const DeviceCommand.turnOff() : this._(CommandAction.turnOff);

  factory DeviceCommand.power(bool on) =>
      on ? const DeviceCommand.turnOn() : const DeviceCommand.turnOff();

  /// [position] is clamped to 0..100.
  factory DeviceCommand.setPosition(int position) => DeviceCommand._(
    CommandAction.setPos,
    position: position < 0 ? 0 : (position > 100 ? 100 : position),
  );

  /// [temperature] is clamped to 16..30.
  factory DeviceCommand.setTemperature(int temperature) => DeviceCommand._(
    CommandAction.setTemp,
    temperature: clampSetpoint(temperature),
  );

  factory DeviceCommand.learnCode(AcSlot slot) =>
      DeviceCommand._(CommandAction.learnCode, slot: slot);

  final CommandAction action;
  final int? position;
  final int? temperature;
  final AcSlot? slot;

  /// The request body.
  Map<String, Object> toJson() => {
    'action': action.apiValue,
    'position': ?position,
    'temperature': ?temperature,
    if (slot != null) 'slot': slot!.apiValue,
  };

  /// The server acks within 5 s or answers `504 TIMEOUT`; learning waits for
  /// the remote, up to 15 s. The client allows some network slack on top.
  Duration get timeout =>
      action == CommandAction.learnCode ? learnTimeout : commandTimeout;

  static const commandTimeout = Duration(seconds: 8);
  static const learnTimeout = Duration(seconds: 20);
}
