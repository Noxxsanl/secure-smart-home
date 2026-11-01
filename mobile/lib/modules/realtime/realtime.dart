/// Public API of the realtime module: the WebSocket source (or its mock) and
/// the typed server events. Applying events to other modules' state is the
/// composition root's job (lib/app/realtime_controller.dart).
library;

export 'application/realtime_providers.dart';
export 'data/realtime_event_mapper.dart';
export 'domain/realtime_event.dart';
