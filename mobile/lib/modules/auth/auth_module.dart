/// Pages of the auth module for the composition root (lib/app/): the ones the
/// root and the shell embed, plus the named routes this module owns.
library;

import 'package:flutter/widgets.dart';

import '../../core/navigation/app_routes.dart';
import 'features/register/register_page.dart';

export 'features/login/login_page.dart' show LoginPage;
export 'features/profile/profile_page.dart' show ProfilePage;
export 'features/splash/splash_page.dart' show SplashPage;

/// Builds the [AppRoutes] owned by this module; null for any other route.
Route<void>? authRoute(RouteSettings settings) => switch (settings.name) {
  AppRoutes.register => pageRoute(settings, const RegisterPage()),
  _ => null,
};
