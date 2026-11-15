/// Pages of the devices module for the composition root (lib/app/): the named
/// routes this module owns.
library;

import 'package:flutter/widgets.dart';

import '../../core/navigation/app_routes.dart';
import 'features/device_detail/device_detail_page.dart';
import 'features/device_list/device_list_page.dart';

/// Builds the [AppRoutes] owned by this module; null for any other route.
Route<void>? devicesRoute(RouteSettings settings) {
  final arguments = settings.arguments;
  return switch (settings.name) {
    AppRoutes.deviceList when arguments is DeviceListRouteArgs => pageRoute(
      settings,
      DeviceListPage(homeId: arguments.homeId),
    ),
    AppRoutes.deviceDetail when arguments is DeviceRouteArgs => pageRoute(
      settings,
      DeviceDetailPage(homeId: arguments.homeId, deviceId: arguments.deviceId),
    ),
    AppRoutes.cameraLive when arguments is DeviceRouteArgs => pageRoute(
      settings,
      DeviceDetailPage(
        homeId: arguments.homeId,
        deviceId: arguments.deviceId,
        autoStartLive: true,
      ),
    ),
    _ => null,
  };
}
