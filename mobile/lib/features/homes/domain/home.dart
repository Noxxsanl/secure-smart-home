import 'package:flutter/foundation.dart';

import 'home_role.dart';

enum HomeStatus {
  unclaimed('unclaimed', 'Chưa kích hoạt'),
  active('active', 'Đang hoạt động'),
  suspended('suspended', 'Tạm ngưng');

  const HomeStatus(this.apiValue, this.label);

  final String apiValue;
  final String label;

  static HomeStatus fromApi(String? value) {
    for (final status in values) {
      if (status.apiValue == value) return status;
    }
    return HomeStatus.active;
  }
}

/// A Smart Home (contract §3 `Home`).
@immutable
class Home {
  const Home({
    required this.id,
    required this.name,
    required this.package,
    required this.status,
    required this.timezone,
    this.address,
    this.ownerCustomerId,
    this.gatewayId,
    this.activatedAt,
    this.createdAt,
  });

  final int id;
  final String name;
  final String? address;

  /// `KIT_A` | `KIT_B`.
  final String package;
  final HomeStatus status;
  final String timezone;
  final int? ownerCustomerId;
  final int? gatewayId;
  final DateTime? activatedAt;
  final DateTime? createdAt;

  bool get isSuspended => status == HomeStatus.suspended;

  /// "KIT A" / "KIT B".
  String get packageLabel => package.replaceAll('_', ' ');

  Home copyWith({String? name, String? address, HomeStatus? status}) => Home(
    id: id,
    name: name ?? this.name,
    address: address ?? this.address,
    package: package,
    status: status ?? this.status,
    timezone: timezone,
    ownerCustomerId: ownerCustomerId,
    gatewayId: gatewayId,
    activatedAt: activatedAt,
    createdAt: createdAt,
  );
}

/// One entry of `GET /homes` (contract §4.2 `MyHome`).
@immutable
class MyHome {
  const MyHome({
    required this.home,
    required this.role,
    this.deviceCount = 0,
    this.onlineCount = 0,
    this.expiresAt,
  });

  final Home home;
  final HomeRole role;
  final int deviceCount;
  final int onlineCount;

  /// GUEST access expiry.
  final DateTime? expiresAt;

  int get id => home.id;

  MyHome copyWith({Home? home, HomeRole? role}) => MyHome(
    home: home ?? this.home,
    role: role ?? this.role,
    deviceCount: deviceCount,
    onlineCount: onlineCount,
    expiresAt: expiresAt,
  );
}
