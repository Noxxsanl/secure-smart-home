import 'package:flutter/material.dart';

import '../../../../core/theme/app_theme.dart';
import '../../../../core/widgets/settings_tile.dart';

/// About (moved from the old bottom-nav tab into Profile). The gateway
/// Bluetooth/OTA card was removed: firmware updates are an operator task
/// (docs/07 §1.5), not a customer feature.
class AboutPage extends StatelessWidget {
  const AboutPage({super.key});

  static const _appName = 'Smart Home IoT';
  static const _version = '1.0.0';
  static const _buildNumber = '1';

  void _comingSoon(BuildContext context, String feature) {
    ScaffoldMessenger.of(context)
      ..hideCurrentSnackBar()
      ..showSnackBar(
        SnackBar(content: Text('$feature sẽ khả dụng trong bản cập nhật sau.')),
      );
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Giới thiệu')),
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
                  const Text(
                    'Phiên bản $_version (build $_buildNumber)',
                    style: TextStyle(
                      fontSize: 12,
                      color: AppColors.textSecondary,
                    ),
                  ),
                ],
              ),
            ),
            const SizedBox(height: 28),
            SettingsSection(
              title: 'TRỢ GIÚP',
              children: [
                SettingsTile(
                  icon: Icons.menu_book_outlined,
                  title: 'Hướng dẫn sử dụng',
                  onTap: () => _comingSoon(context, 'Hướng dẫn sử dụng'),
                ),
                SettingsTile(
                  icon: Icons.quiz_outlined,
                  title: 'Câu hỏi thường gặp',
                  onTap: () => _comingSoon(context, 'Câu hỏi thường gặp'),
                ),
                SettingsTile(
                  icon: Icons.mail_outline,
                  title: 'Liên hệ hỗ trợ',
                  subtitle: 'support@smarthome.local',
                  onTap: () => _comingSoon(context, 'Liên hệ hỗ trợ'),
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
                  onTap: () => _comingSoon(context, 'Điều khoản dịch vụ'),
                ),
                SettingsTile(
                  icon: Icons.privacy_tip_outlined,
                  title: 'Chính sách bảo mật',
                  onTap: () => _comingSoon(context, 'Chính sách bảo mật'),
                ),
                SettingsTile(
                  icon: Icons.article_outlined,
                  title: 'Giấy phép mã nguồn mở',
                  onTap: () => showLicensePage(
                    context: context,
                    applicationName: _appName,
                    applicationVersion: 'v$_version ($_buildNumber)',
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
