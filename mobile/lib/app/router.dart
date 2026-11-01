import 'package:flutter/widgets.dart';

import '../modules/auth/auth_module.dart';
import '../modules/devices/devices_module.dart';
import '../modules/homes/homes_module.dart';

/// Named routes ([AppRoutes]) of every module. Each module builds its own
/// pages; this is the only place that knows all of them.
Route<void>? onGenerateAppRoute(RouteSettings settings) =>
    authRoute(settings) ?? homesRoute(settings) ?? devicesRoute(settings);
