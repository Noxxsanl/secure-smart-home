/// Role inside one Smart Home (docs/01 §7, contract §4.1). The backend is the
/// source of truth; the UI mirrors the matrix to hide/disable actions.
enum HomeRole {
  owner('OWNER', 'Chủ nhà'),
  controller('CONTROLLER', 'Điều khiển'),
  viewer('VIEWER', 'Chỉ xem'),
  guest('GUEST', 'Khách');

  const HomeRole(this.apiValue, this.label);

  final String apiValue;
  final String label;

  /// Unknown values fall back to the least privileged role.
  static HomeRole fromApi(String? value) {
    final normalized = value?.trim().toUpperCase();
    for (final role in values) {
      if (role.apiValue == normalized) return role;
    }
    return HomeRole.guest;
  }

  String get description => switch (this) {
    HomeRole.owner => 'Toàn quyền quản lý nhà, thiết bị và thành viên.',
    HomeRole.controller =>
      'Điều khiển thiết bị, đổi tên và tạo tự động hoá. Không quản lý thành viên.',
    HomeRole.viewer => 'Chỉ xem thiết bị, dữ liệu và thông báo.',
    HomeRole.guest =>
      'Chỉ dùng các thiết bị được chọn, trong thời hạn nhất định.',
  };

  /// Rename home / room / device.
  bool get canRename => this == owner || this == controller;

  /// Invite, change role, remove members.
  bool get canManageMembers => this == owner;

  /// See automation rules and AI suggestions (GUEST gets 403).
  bool get canViewAutomation => this != guest;

  /// Create rules, accept/dismiss suggestions.
  bool get canEditAutomation => this == owner || this == controller;

  bool get canLeave => this != owner;

  /// Roles an owner may hand out when inviting.
  static const invitable = [controller, viewer, guest];
}
