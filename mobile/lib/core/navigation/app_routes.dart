import 'package:flutter/material.dart';

/// Screens that are opened from another feature. A feature never imports
/// another feature's page: it pushes a named route and `app/router.dart` asks
/// each module's `<m>_module.dart` to build it (mobile/README.md §3).
/// Sub-screens reachable from a single screen stay inside that feature.
abstract final class AppRoutes {
  static const register = '/register';
  static const claim = '/homes/claim';
  static const myInvitations = '/homes/invitations';
  static const members = '/homes/members';
  static const roomDetail = '/homes/room';
  static const deviceDetail = '/devices/detail';
}

/// Arguments of [AppRoutes.members].
typedef MembersRouteArgs = ({int homeId});

/// Arguments of [AppRoutes.roomDetail].
typedef RoomRouteArgs = ({int homeId, int roomId});

/// Arguments of [AppRoutes.deviceDetail].
typedef DeviceRouteArgs = ({int homeId, int deviceId});

/// Typed entry points, so callers cannot pass the wrong arguments.
extension AppNavigation on NavigatorState {
  Future<void> openRegister() => pushNamed<void>(AppRoutes.register);

  Future<void> openClaim() => pushNamed<void>(AppRoutes.claim);

  Future<void> openMyInvitations() => pushNamed<void>(AppRoutes.myInvitations);

  Future<void> openMembers({required int homeId}) =>
      _open<MembersRouteArgs>(AppRoutes.members, (homeId: homeId));

  Future<void> openRoom({required int homeId, required int roomId}) =>
      _open<RoomRouteArgs>(AppRoutes.roomDetail, (
        homeId: homeId,
        roomId: roomId,
      ));

  Future<void> openDevice({required int homeId, required int deviceId}) =>
      _open<DeviceRouteArgs>(AppRoutes.deviceDetail, (
        homeId: homeId,
        deviceId: deviceId,
      ));

  Future<void> _open<A>(String name, A arguments) =>
      pushNamed<void>(name, arguments: arguments);
}

/// The page route every `<m>_module.dart` returns; keeps [settings] (name and
/// arguments) on the route.
Route<void> pageRoute(RouteSettings settings, Widget page) =>
    MaterialPageRoute<void>(settings: settings, builder: (_) => page);
