import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../../core/theme/app_theme.dart';
import '../../../../core/widgets/app_widgets.dart';
import '../../../../core/widgets/app_feedback.dart';
import '../../../../core/widgets/settings_tile.dart';
import '../../../auth/presentation/providers/auth_providers.dart';
import '../../../claim/presentation/pages/claim_page.dart';
import '../../../homes/presentation/providers/homes_providers.dart';
import '../../../members/presentation/pages/members_page.dart';
import '../../../members/presentation/pages/my_invitations_page.dart';
import '../../../members/presentation/providers/members_providers.dart';
import 'about_page.dart';
import 'change_password_page.dart';
import 'edit_profile_page.dart';

/// "Hồ sơ" tab: account, my homes (switch), members, invitations, About and
/// logout.
class ProfilePage extends ConsumerWidget {
  const ProfilePage({super.key});

  void _push(BuildContext context, Widget page) => Navigator.of(
    context,
  ).push(MaterialPageRoute<void>(builder: (_) => page));

  Future<void> _logout(BuildContext context, WidgetRef ref) async {
    final ok = await confirmDialog(
      context,
      title: 'Đăng xuất',
      message: 'Bạn có chắc chắn muốn đăng xuất khỏi ứng dụng?',
      confirmLabel: 'Đăng xuất',
    );
    if (!ok || !context.mounted) return;
    Navigator.of(context).popUntil((route) => route.isFirst);
    await ref.read(authControllerProvider.notifier).logout();
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final user = ref.watch(authControllerProvider.select((s) => s.user));
    final homes = ref.watch(homesProvider).value;
    final current = homes?.current;
    final invitationCount =
        ref.watch(invitationsProvider).value?.length ?? 0;

    return Scaffold(
      appBar: AppBar(
        automaticallyImplyLeading: false,
        title: const Text('Hồ sơ'),
      ),
      body: SafeArea(
        child: ListView(
          padding: const EdgeInsets.fromLTRB(20, 8, 20, 32),
          children: [
            AppCard(
              child: Row(
                children: [
                  InitialsAvatar(user?.initials ?? '?', radius: 32),
                  const SizedBox(width: 16),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          user?.displayName ?? '',
                          style: const TextStyle(
                            fontSize: 17,
                            fontWeight: FontWeight.bold,
                          ),
                        ),
                        if (user?.email != null)
                          Text(
                            user!.email!,
                            style: const TextStyle(
                              fontSize: 12,
                              color: AppColors.textSecondary,
                            ),
                          ),
                        if (user?.userTag != null)
                          Padding(
                            padding: const EdgeInsets.only(top: 8),
                            child: StatusPill('Mã khách hàng ${user!.userTag}'),
                          ),
                      ],
                    ),
                  ),
                  IconButton(
                    tooltip: 'Chỉnh sửa hồ sơ',
                    onPressed: () => _push(context, const EditProfilePage()),
                    icon: const Icon(Icons.edit_outlined),
                  ),
                ],
              ),
            ),
            const SizedBox(height: 24),
            if (homes != null && homes.homes.isNotEmpty) ...[
              SettingsSection(
                title: 'NHÀ CỦA TÔI',
                children: [
                  for (final h in homes.homes)
                    SettingsTile(
                      icon: Icons.home_outlined,
                      title: h.home.name,
                      subtitle:
                          '${h.role.label} · ${h.onlineCount}/${h.deviceCount} thiết bị online',
                      onTap: () => ref.read(homesProvider.notifier).select(h.id),
                      trailing: h.id == current?.id
                          ? const Icon(
                              Icons.check_circle,
                              color: AppColors.primary,
                            )
                          : const Icon(
                              Icons.radio_button_unchecked,
                              color: AppColors.textSecondary,
                            ),
                    ),
                  SettingsTile(
                    icon: Icons.add_home_outlined,
                    title: 'Thêm Smart Home',
                    subtitle: 'Quét mã QR hoặc nhập mã kích hoạt',
                    onTap: () => _push(context, const ClaimPage()),
                  ),
                ],
              ),
              const SizedBox(height: 20),
            ],
            SettingsSection(
              title: 'GIA ĐÌNH',
              children: [
                if (current != null)
                  SettingsTile(
                    icon: Icons.people_outline,
                    title: 'Thành viên',
                    subtitle: 'Vai trò của bạn: ${current.role.label}',
                    onTap: () =>
                        _push(context, MembersPage(homeId: current.id)),
                  ),
                SettingsTile(
                  icon: Icons.mail_outline,
                  title: 'Lời mời của tôi',
                  subtitle: invitationCount > 0
                      ? '$invitationCount lời mời đang chờ'
                      : null,
                  onTap: () => _push(context, const MyInvitationsPage()),
                ),
              ],
            ),
            const SizedBox(height: 20),
            SettingsSection(
              title: 'TÀI KHOẢN',
              children: [
                SettingsTile(
                  icon: Icons.person_outline,
                  title: 'Chỉnh sửa hồ sơ',
                  onTap: () => _push(context, const EditProfilePage()),
                ),
                SettingsTile(
                  icon: Icons.lock_outline,
                  title: 'Đổi mật khẩu',
                  onTap: () => _push(context, const ChangePasswordPage()),
                ),
                SettingsTile(
                  icon: Icons.info_outline,
                  title: 'Giới thiệu',
                  onTap: () => _push(context, const AboutPage()),
                ),
              ],
            ),
            const SizedBox(height: 28),
            OutlinedButton.icon(
              onPressed: () => _logout(context, ref),
              style: OutlinedButton.styleFrom(
                foregroundColor: AppColors.critical,
                side: const BorderSide(color: AppColors.critical),
              ),
              icon: const Icon(Icons.logout),
              label: const Text('Đăng xuất'),
            ),
          ],
        ),
      ),
    );
  }
}
