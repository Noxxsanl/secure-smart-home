/// Public API of the automation module (rules, habit suggestions, one-off
/// schedules, the suggestion card and the device "Hẹn giờ" block) for other
/// modules. Pages: automation_module.dart (only lib/app/ imports it).
library;

export 'application/automation_providers.dart';
export 'application/schedule_providers.dart';
// Contract mapper: assistant replies embed schedules.
export 'data/schedule_mapper.dart';
export 'domain/automation_repository.dart';
export 'domain/automation_rule.dart';
export 'domain/rule_description.dart';
export 'domain/schedule.dart';
export 'domain/schedule_input.dart';
export 'domain/schedule_repository.dart';
export 'domain/schedule_text.dart';
export 'ui/create_schedule_sheet.dart';
export 'ui/device_schedule_section.dart';
export 'ui/schedule_tile.dart';
export 'ui/suggestion_card.dart';
