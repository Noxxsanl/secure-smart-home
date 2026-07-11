import 'package:flutter/material.dart';

import '../../../../core/theme/app_theme.dart';
import '../../../../core/widgets/settings_tile.dart';
import '../../../profile/data/mock_household.dart';

class AboutPage extends StatelessWidget {
  const AboutPage({super.key});

  static const _appName = 'Smart Home IoT';
  static const _version = '1.0.0';
  static const _buildNumber = '1';

  void _showComingSoon(BuildContext context, String feature) {
    ScaffoldMessenger.of(context)
      ..hideCurrentSnackBar()
      ..showSnackBar(
        SnackBar(content: Text('$feature sẽ khả dụng khi kết nối backend.')),
      );
  }

  void _connectBluetooth(BuildContext context) {
    ScaffoldMessenger.of(context)
      ..hideCurrentSnackBar()
      ..showSnackBar(
        const SnackBar(
          content: Text(
            'Tính năng kết nối Bluetooth sẽ được hoàn thiện cùng OTA Gateway.',
          ),
        ),
      );
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        automaticallyImplyLeading: false,
        title: const Text('About'),
      ),
      body: SafeArea(
        child: ListView(
          padding: const EdgeInsets.fromLTRB(20, 8, 20, 32),
          children: [
            Center(
              child: Column(
                children: [
                  Container(
                    padding: const EdgeInsets.all(20),
                    decoration: BoxDecoration(
                      color: AppColors.primary,
                      borderRadius: BorderRadius.circular(24),
                    ),
                    child: const Icon(
                      Icons.home_filled,
                      size: 40,
                      color: Colors.white,
                    ),
                  ),
                  const SizedBox(height: 16),
                  const Text(
                    _appName,
                    style: TextStyle(fontSize: 20, fontWeight: FontWeight.bold),
                  ),
                  const SizedBox(height: 4),
                  const Text(
                    'Điều khiển ngôi nhà thông minh của bạn\nmọi lúc, mọi nơi.',
                    textAlign: TextAlign.center,
                    style: TextStyle(color: AppColors.textSecondary),
                  ),
                  const SizedBox(height: 8),
                  Text(
                    'Phiên bản $_version (build $_buildNumber)',
                    style: const TextStyle(
                      fontSize: 12,
                      color: AppColors.textSecondary,
                    ),
                  ),
                ],
              ),
            ),
            const SizedBox(height: 28),
            Material(
              color: AppColors.surface,
              borderRadius: BorderRadius.circular(24),
              child: Padding(
                padding: const EdgeInsets.all(20),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    Row(
                      children: [
                        Container(
                          padding: const EdgeInsets.all(10),
                          decoration: BoxDecoration(
                            color: AppColors.surfaceTint,
                            borderRadius: BorderRadius.circular(14),
                          ),
                          child: const Icon(
                            Icons.router_outlined,
                            color: AppColors.primary,
                          ),
                        ),
                        const SizedBox(width: 12),
                        Expanded(
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              const Text(
                                'ESP Gateway',
                                style: TextStyle(fontWeight: FontWeight.bold),
                              ),
                              Text(
                                MockHousehold.gatewayOnline
                                    ? 'Đang kết nối · Firmware ${MockHousehold.gatewayFirmware}'
                                    : 'Chưa kết nối',
                                style: const TextStyle(
                                  fontSize: 12,
                                  color: AppColors.textSecondary,
                                ),
                              ),
                            ],
                          ),
                        ),
                        Container(
                          width: 10,
                          height: 10,
                          decoration: BoxDecoration(
                            shape: BoxShape.circle,
                            color: MockHousehold.gatewayOnline
                                ? Colors.green
                                : Colors.grey,
                          ),
                        ),
                      ],
                    ),
                    const SizedBox(height: 14),
                    const Text(
                      'Kết nối ứng dụng với ESP Gateway qua Bluetooth để kiểm tra '
                      'và cài đặt firmware mới cho toàn bộ hệ thống nhà thông minh.',
                      style: TextStyle(color: AppColors.textSecondary),
                    ),
                    const SizedBox(height: 18),
                    Row(
                      children: [
                        Expanded(
                          child: FilledButton.icon(
                            key: const Key('connectBluetoothButton'),
                            onPressed: () => _connectBluetooth(context),
                            icon: const Icon(Icons.bluetooth),
                            label: const Text('Kết nối'),
                          ),
                        ),
                        const SizedBox(width: 12),
                        Expanded(
                          child: OutlinedButton.icon(
                            onPressed: () =>
                                _showComingSoon(context, 'Kiểm tra cập nhật'),
                            icon: const Icon(Icons.system_update_alt),
                            label: const Text('Cập nhật'),
                          ),
                        ),
                      ],
                    ),
                  ],
                ),
              ),
            ),
            const SizedBox(height: 24),
            SettingsSection(
              title: 'TRỢ GIÚP',
              children: [
                SettingsTile(
                  icon: Icons.menu_book_outlined,
                  title: 'Hướng dẫn sử dụng',
                  onTap: () => _showComingSoon(context, 'Hướng dẫn sử dụng'),
                ),
                SettingsTile(
                  icon: Icons.quiz_outlined,
                  title: 'Câu hỏi thường gặp',
                  onTap: () => _showComingSoon(context, 'Câu hỏi thường gặp'),
                ),
                SettingsTile(
                  icon: Icons.mail_outline,
                  title: 'Liên hệ hỗ trợ',
                  subtitle: 'support@smarthome.local',
                  onTap: () => _showComingSoon(context, 'Liên hệ hỗ trợ'),
                ),
              ],
            ),
            const SizedBox(height: 20),
            SettingsSection(
              title: 'PHÁP LÝ',
              children: [
                SettingsTile(
                  icon: Icons.description_outlined,
                  title: 'Điều khoản dịch vụ',
                  onTap: () => _showComingSoon(context, 'Điều khoản dịch vụ'),
                ),
                SettingsTile(
                  icon: Icons.privacy_tip_outlined,
                  title: 'Chính sách bảo mật',
                  onTap: () => _showComingSoon(context, 'Chính sách bảo mật'),
                ),
                SettingsTile(
                  icon: Icons.article_outlined,
                  title: 'Giấy phép mã nguồn mở',
                  onTap: () => showLicensePage(
                    context: context,
                    applicationName: _appName,
                    applicationVersion: 'v$_version ($_buildNumber)',
                    applicationIcon: Padding(
                      padding: const EdgeInsets.only(top: 12),
                      child: Container(
                        padding: const EdgeInsets.all(12),
                        decoration: BoxDecoration(
                          color: AppColors.primary,
                          borderRadius: BorderRadius.circular(16),
                        ),
                        child: const Icon(Icons.home_filled, color: Colors.white),
                      ),
                    ),
                  ),
                ),
              ],
            ),
            const SizedBox(height: 28),
            const Center(
              child: Text(
                '© 2026 Smart Home IoT · Đồ án tốt nghiệp',
                style: TextStyle(fontSize: 11, color: AppColors.textSecondary),
              ),
            ),
          ],
        ),
      ),
    );
  }
}
