import '../models/family_member.dart';

/// Static mock data describing the signed-in user's smart home —
/// modeled after the Owner/Controller/Viewer/Guest household roles.
class MockHousehold {
  const MockHousehold._();

  static const homeName = 'Nhà của Đạt';
  static const address = '12 Nguyễn Huệ, Quận 1, TP. Hồ Chí Minh';
  static const package = 'Smart Home Kit A';

  static const gatewayOnline = true;
  static const gatewayFirmware = 'v2.3.1';

  static const members = <FamilyMember>[
    FamilyMember(
      name: 'Nguyễn Hoàng Đạt',
      roleLabel: 'Chủ nhà · Owner',
      initials: 'HĐ',
      isYou: true,
    ),
    FamilyMember(
      name: 'Thu Hằng',
      roleLabel: 'Thành viên · Controller',
      initials: 'TH',
    ),
    FamilyMember(
      name: 'Bé Bin',
      roleLabel: 'Khách · Viewer',
      initials: 'BB',
    ),
  ];
}
