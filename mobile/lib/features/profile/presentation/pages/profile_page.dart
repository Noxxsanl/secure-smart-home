import 'package:flutter/material.dart';

import '../../../../core/theme/app_theme.dart';
import '../../../../core/widgets/settings_tile.dart';
import '../../../auth/models/mock_user.dart';
import '../../../rooms/data/mock_rooms.dart';
import '../../../rooms/presentation/pages/room_list_page.dart';
import '../../data/mock_household.dart';

class ProfilePage extends StatefulWidget {
  const ProfilePage({super.key, required this.user});

  final MockUser user;

  @override
  State<ProfilePage> createState() => _ProfilePageState();
}

class _ProfilePageState extends State<ProfilePage> {
  bool _pushNotifications = true;
  bool _twoFactorEnabled = false;
  String _temperatureUnit = '°C';

  void _showComingSoon(String feature) {
    ScaffoldMessenger.of(context)
      ..hideCurrentSnackBar()
      ..showSnackBar(
        SnackBar(content: Text('$feature sẽ khả dụng khi kết nối backend.')),
      );
  }

  Future<void> _confirmDestructive({
    required String title,
    required String message,
    required String confirmLabel,
  }) async {
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: Text(title),
        content: Text(message),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(context).pop(false),
            child: const Text('Huỷ'),
          ),
          TextButton(
            onPressed: () => Navigator.of(context).pop(true),
            style: TextButton.styleFrom(foregroundColor: Colors.redAccent),
            child: Text(confirmLabel),
          ),
        ],
      ),
    );

    if (confirmed == true && mounted) {
      _showComingSoon(confirmLabel);
    }
  }

  Future<void> _logout() async {
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('Đăng xuất'),
        content: const Text('Bạn có chắc chắn muốn đăng xuất khỏi ứng dụng?'),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(context).pop(false),
            child: const Text('Huỷ'),
          ),
          TextButton(
            onPressed: () => Navigator.of(context).pop(true),
            child: const Text('Đăng xuất'),
          ),
        ],
      ),
    );

    if (confirmed == true && mounted) {
      Navigator.of(context).pop();
    }
  }

  void _showFamilyMembers() {
    showModalBottomSheet<void>(
      context: context,
      backgroundColor: AppColors.background,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(24)),
      ),
      builder: (context) {
        return SafeArea(
          child: Padding(
            padding: const EdgeInsets.fromLTRB(20, 20, 20, 24),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const Text(
                  'Thành viên gia đình',
                  style: TextStyle(fontSize: 18, fontWeight: FontWeight.bold),
                ),
                const SizedBox(height: 4),
                Text(
                  '${MockHousehold.members.length} người trong ${MockHousehold.homeName}',
                  style: const TextStyle(color: AppColors.textSecondary),
                ),
                const SizedBox(height: 16),
                for (final member in MockHousehold.members)
                  Padding(
                    padding: const EdgeInsets.symmetric(vertical: 8),
                    child: Row(
                      children: [
                        CircleAvatar(
                          radius: 20,
                          backgroundColor: AppColors.primary,
                          child: Text(
                            member.initials,
                            style: const TextStyle(color: Colors.white),
                          ),
                        ),
                        const SizedBox(width: 14),
                        Expanded(
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Text(
                                member.isYou
                                    ? '${member.name} (Bạn)'
                                    : member.name,
                                style: const TextStyle(
                                  fontWeight: FontWeight.w600,
                                ),
                              ),
                              Text(
                                member.roleLabel,
                                style: const TextStyle(
                                  fontSize: 12,
                                  color: AppColors.textSecondary,
                                ),
                              ),
                            ],
                          ),
                        ),
                      ],
                    ),
                  ),
                const SizedBox(height: 8),
                OutlinedButton.icon(
                  onPressed: () {
                    Navigator.of(context).pop();
                    _showComingSoon('Mời thành viên');
                  },
                  icon: const Icon(Icons.person_add_alt_outlined),
                  label: const Text('Mời thành viên mới'),
                ),
              ],
            ),
          ),
        );
      },
    );
  }

  Future<void> _pickTemperatureUnit() async {
    final unit = await showDialog<String>(
      context: context,
      builder: (context) => SimpleDialog(
        title: const Text('Đơn vị nhiệt độ'),
        children: [
          for (final option in ['°C', '°F'])
            SimpleDialogOption(
              onPressed: () => Navigator.of(context).pop(option),
              child: Row(
                children: [
                  Icon(
                    option == _temperatureUnit
                        ? Icons.radio_button_checked
                        : Icons.radio_button_off,
                    color: AppColors.primary,
                    size: 20,
                  ),
                  const SizedBox(width: 12),
                  Text(option == '°C' ? 'Celsius (°C)' : 'Fahrenheit (°F)'),
                ],
              ),
            ),
        ],
      ),
    );

    if (unit != null) {
      setState(() => _temperatureUnit = unit);
    }
  }

  @override
  Widget build(BuildContext context) {
    final user = widget.user;

    return Scaffold(
      appBar: AppBar(
        automaticallyImplyLeading: false,
        title: const Text('Profile'),
      ),
      body: SafeArea(
        child: ListView(
          padding: const EdgeInsets.fromLTRB(20, 8, 20, 32),
          children: [
            _ProfileHeader(user: user, onEdit: () => _showComingSoon('Chỉnh sửa hồ sơ')),
            const SizedBox(height: 16),
            _HouseholdCard(onTap: _showFamilyMembers),
            const SizedBox(height: 24),
            SettingsSection(
              title: 'GIA ĐÌNH & THIẾT BỊ',
              children: [
                SettingsTile(
                  icon: Icons.people_outline,
                  title: 'Thành viên gia đình',
                  subtitle: '${MockHousehold.members.length} người · vai trò & quyền truy cập',
                  onTap: _showFamilyMembers,
                ),
                SettingsTile(
                  icon: Icons.meeting_room_outlined,
                  title: 'Quản lý phòng',
                  subtitle: '${MockRooms.all.length} phòng trong nhà',
                  onTap: () => Navigator.of(context).push(
                    MaterialPageRoute<void>(
                      builder: (_) => const RoomListPage(),
                    ),
                  ),
                ),
                SettingsTile(
                  icon: Icons.router_outlined,
                  title: 'Gateway',
                  subtitle: MockHousehold.gatewayOnline
                      ? 'Đang kết nối · Firmware ${MockHousehold.gatewayFirmware}'
                      : 'Chưa kết nối',
                  onTap: () => _showComingSoon('Quản lý Gateway'),
                ),
                SettingsTile(
                  icon: Icons.swap_horiz,
                  title: 'Chuyển quyền sở hữu',
                  subtitle: 'Chuyển nhà cho chủ sở hữu khác',
                  onTap: () => _showComingSoon('Chuyển quyền sở hữu'),
                ),
              ],
            ),
            const SizedBox(height: 20),
            SettingsSection(
              title: 'TUỲ CHỈNH',
              children: [
                SettingsTile(
                  icon: Icons.notifications_none,
                  title: 'Thông báo đẩy',
                  subtitle: 'Cảnh báo thiết bị & hoạt động bất thường',
                  trailing: Switch(
                    value: _pushNotifications,
                    onChanged: (value) =>
                        setState(() => _pushNotifications = value),
                  ),
                ),
                SettingsTile(
                  icon: Icons.dark_mode_outlined,
                  title: 'Chế độ tối',
                  subtitle: 'Sẽ hỗ trợ trong bản cập nhật tới',
                  enabled: false,
                  trailing: const Switch(value: false, onChanged: null),
                ),
                SettingsTile(
                  icon: Icons.thermostat_outlined,
                  title: 'Đơn vị nhiệt độ',
                  onTap: _pickTemperatureUnit,
                  trailing: Row(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      Text(
                        _temperatureUnit,
                        style: const TextStyle(
                          color: AppColors.textSecondary,
                          fontWeight: FontWeight.w600,
                        ),
                      ),
                      const Icon(
                        Icons.chevron_right,
                        color: AppColors.textSecondary,
                      ),
                    ],
                  ),
                ),
                SettingsTile(
                  icon: Icons.language_outlined,
                  title: 'Ngôn ngữ',
                  onTap: () => _showComingSoon('Đổi ngôn ngữ'),
                  trailing: const Row(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      Text(
                        'Tiếng Việt',
                        style: TextStyle(
                          color: AppColors.textSecondary,
                          fontWeight: FontWeight.w600,
                        ),
                      ),
                      Icon(Icons.chevron_right, color: AppColors.textSecondary),
                    ],
                  ),
                ),
              ],
            ),
            const SizedBox(height: 20),
            SettingsSection(
              title: 'BẢO MẬT',
              children: [
                SettingsTile(
                  icon: Icons.lock_outline,
                  title: 'Đổi mật khẩu',
                  onTap: () => _showComingSoon('Đổi mật khẩu'),
                ),
                SettingsTile(
                  icon: Icons.verified_user_outlined,
                  title: 'Xác thực 2 lớp',
                  subtitle: _twoFactorEnabled ? 'Đang bật' : 'Đang tắt',
                  trailing: Switch(
                    value: _twoFactorEnabled,
                    onChanged: (value) =>
                        setState(() => _twoFactorEnabled = value),
                  ),
                ),
                SettingsTile(
                  icon: Icons.devices_other_outlined,
                  title: 'Phiên đăng nhập',
                  subtitle: '1 thiết bị đang hoạt động',
                  onTap: () => _showComingSoon('Quản lý phiên đăng nhập'),
                ),
              ],
            ),
            const SizedBox(height: 20),
            SettingsSection(
              title: 'HỖ TRỢ',
              children: [
                SettingsTile(
                  icon: Icons.help_outline,
                  title: 'Trung tâm trợ giúp',
                  onTap: () => _showComingSoon('Trung tâm trợ giúp'),
                ),
                SettingsTile(
                  icon: Icons.mail_outline,
                  title: 'Liên hệ hỗ trợ',
                  onTap: () => _showComingSoon('Liên hệ hỗ trợ'),
                ),
                SettingsTile(
                  icon: Icons.star_border,
                  title: 'Đánh giá ứng dụng',
                  onTap: () => _showComingSoon('Đánh giá ứng dụng'),
                ),
              ],
            ),
            const SizedBox(height: 20),
            SettingsSection(
              title: 'VÙNG NGUY HIỂM',
              children: [
                SettingsTile(
                  icon: Icons.restart_alt,
                  title: 'Đặt lại Smart Home',
                  subtitle: 'Gỡ toàn bộ thiết bị & thành viên',
                  destructive: true,
                  onTap: () => _confirmDestructive(
                    title: 'Đặt lại Smart Home?',
                    message:
                        'Toàn bộ thiết bị và thành viên (trừ bạn) sẽ bị gỡ khỏi ${MockHousehold.homeName}. Hành động này không thể hoàn tác.',
                    confirmLabel: 'Đặt lại',
                  ),
                ),
                SettingsTile(
                  icon: Icons.person_remove_outlined,
                  title: 'Xoá tài khoản',
                  subtitle: 'Xoá vĩnh viễn tài khoản của bạn',
                  destructive: true,
                  onTap: () => _confirmDestructive(
                    title: 'Xoá tài khoản?',
                    message:
                        'Tài khoản và toàn bộ dữ liệu cá nhân của bạn sẽ bị xoá vĩnh viễn.',
                    confirmLabel: 'Xoá tài khoản',
                  ),
                ),
              ],
            ),
            const SizedBox(height: 28),
            OutlinedButton.icon(
              onPressed: _logout,
              style: OutlinedButton.styleFrom(
                foregroundColor: Colors.redAccent,
                side: const BorderSide(color: Colors.redAccent),
                padding: const EdgeInsets.symmetric(vertical: 16),
                shape: RoundedRectangleBorder(
                  borderRadius: BorderRadius.circular(18),
                ),
              ),
              icon: const Icon(Icons.logout),
              label: const Text('Đăng xuất'),
            ),
            const SizedBox(height: 16),
            Center(
              child: Text(
                'Đăng nhập với ${user.email}',
                style: const TextStyle(
                  fontSize: 12,
                  color: AppColors.textSecondary,
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _ProfileHeader extends StatelessWidget {
  const _ProfileHeader({required this.user, required this.onEdit});

  final MockUser user;
  final VoidCallback onEdit;

  @override
  Widget build(BuildContext context) {
    return Material(
      color: AppColors.surface,
      borderRadius: BorderRadius.circular(24),
      child: Padding(
        padding: const EdgeInsets.all(18),
        child: Row(
          children: [
            CircleAvatar(
              radius: 32,
              backgroundColor: AppColors.primary,
              child: Text(
                user.initials,
                style: const TextStyle(
                  color: Colors.white,
                  fontSize: 20,
                  fontWeight: FontWeight.bold,
                ),
              ),
            ),
            const SizedBox(width: 16),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    user.name,
                    style: const TextStyle(
                      fontSize: 17,
                      fontWeight: FontWeight.bold,
                    ),
                  ),
                  const SizedBox(height: 2),
                  Text(
                    user.email,
                    style: const TextStyle(
                      fontSize: 12,
                      color: AppColors.textSecondary,
                    ),
                  ),
                  const SizedBox(height: 8),
                  Container(
                    padding: const EdgeInsets.symmetric(
                      horizontal: 10,
                      vertical: 4,
                    ),
                    decoration: BoxDecoration(
                      color: AppColors.surfaceTint,
                      borderRadius: BorderRadius.circular(10),
                    ),
                    child: const Text(
                      'Chủ nhà · Owner',
                      style: TextStyle(
                        fontSize: 11,
                        fontWeight: FontWeight.bold,
                        color: AppColors.primary,
                      ),
                    ),
                  ),
                ],
              ),
            ),
            IconButton(
              onPressed: onEdit,
              icon: const Icon(Icons.edit_outlined),
              color: AppColors.textSecondary,
            ),
          ],
        ),
      ),
    );
  }
}

class _HouseholdCard extends StatelessWidget {
  const _HouseholdCard({required this.onTap});

  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return Material(
      color: AppColors.primary,
      borderRadius: BorderRadius.circular(24),
      child: InkWell(
        borderRadius: BorderRadius.circular(24),
        onTap: onTap,
        child: Padding(
          padding: const EdgeInsets.all(18),
          child: Row(
            children: [
              Container(
                padding: const EdgeInsets.all(12),
                decoration: BoxDecoration(
                  color: Colors.white.withValues(alpha: 0.18),
                  borderRadius: BorderRadius.circular(16),
                ),
                child: const Icon(Icons.home_outlined, color: Colors.white),
              ),
              const SizedBox(width: 14),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    const Text(
                      MockHousehold.homeName,
                      style: TextStyle(
                        color: Colors.white,
                        fontWeight: FontWeight.bold,
                        fontSize: 15,
                      ),
                    ),
                    const SizedBox(height: 2),
                    Text(
                      '${MockHousehold.package} · ${MockHousehold.members.length} thành viên',
                      style: const TextStyle(
                        color: Colors.white70,
                        fontSize: 12,
                      ),
                    ),
                  ],
                ),
              ),
              const Icon(Icons.chevron_right, color: Colors.white),
            ],
          ),
        ),
      ),
    );
  }
}
