/// Pages of the homes module for the composition root (lib/app/): the ones the
/// root and the shell embed, plus the named routes this module owns.
library;

import 'package:flutter/widgets.dart';

import '../../core/navigation/app_routes.dart';
import 'features/claim/claim_page.dart';
import 'features/members/members_page.dart';
import 'features/my_invitations/my_invitations_page.dart';
import 'features/room_detail/room_detail_page.dart';

export 'features/home_dashboard/home_page.dart' show HomePage;
export 'features/onboarding/onboarding_page.dart' show OnboardingPage;
export 'features/room_list/room_list_page.dart' show RoomListPage;

/// Builds the [AppRoutes] owned by this module; null for any other route.
Route<void>? homesRoute(RouteSettings settings) {
  final arguments = settings.arguments;
  return switch (settings.name) {
    AppRoutes.claim => pageRoute(settings, const ClaimPage()),
    AppRoutes.myInvitations => pageRoute(settings, const MyInvitationsPage()),
    AppRoutes.members when arguments is MembersRouteArgs => pageRoute(
      settings,
      MembersPage(homeId: arguments.homeId),
    ),
    AppRoutes.roomDetail when arguments is RoomRouteArgs => pageRoute(
      settings,
      RoomDetailPage(homeId: arguments.homeId, roomId: arguments.roomId),
    ),
    _ => null,
  };
}
