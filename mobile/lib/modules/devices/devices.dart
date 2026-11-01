/// Public API of the devices module (device entity, power/rename, telemetry,
/// device tiles and rows) for other modules. Pages: devices_module.dart (only
/// lib/app/ imports it).
library;

export 'application/device_providers.dart';
// Contract mapper: overview, room and realtime payloads embed devices.
export 'data/device_mapper.dart';
export 'domain/device.dart';
export 'domain/device_repository.dart';
export 'ui/device_presentation.dart';
export 'ui/device_row.dart';
export 'ui/device_tile.dart';
