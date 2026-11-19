import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../../core/navigation/app_routes.dart';
import '../../../../core/widgets/async_views.dart';
import '../../../auth/auth.dart';
import '../../application/homes_providers.dart';
import '../../application/members_providers.dart';

/// Shown instead of the shell when the user has no Smart Home yet
/// (docs/architecture/MOBILE_APP_ARCHITECTURE.md §13): claim a kit or answer an invitation.
class OnboardingPage extends ConsumerWidget {
  const OnboardingPage({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final user = ref.watch(authControllerProvider.select((s) => s.user));
    final invitations = ref.watch(invitationsProvider).value?.length ?? 0;

    return Scaffold(
      appBar: AppBar(
        automaticallyImplyLeading: false,
        title: Text('Xin chào, ${user?.firstName ?? ''}'),
        actions: [
          TextButton(
            onPressed: () => ref.read(authControllerProvider.notifier).logout(),
            child: const Text('Đăng xuất'),
          ),
        ],
      ),
      body: RefreshIndicator(
        onRefresh: () async {
          await ref.read(homesProvider.notifier).refresh();
          await ref.read(invitationsProvider.notifier).refresh();
        },
        child: ListView(
          physics: const AlwaysScrollableScrollPhysics(),
          padding: const EdgeInsets.fromLTRB(24, 40, 24, 24),
          children: [
            const EmptyState(
              icon: Icons.add_home_outlined,
              title: 'Bạn chưa có Smart Home nào',
              message:
                  'Quét mã QR hoặc nhập mã kích hoạt in trên hộp sản phẩm để nhận quyền chủ nhà. '
                  'Nếu được người thân mời vào nhà của họ, hãy mở "Lời mời của tôi".',
            ),
            const SizedBox(height: 24),
            FilledButton.icon(
              key: const ValueKey<String>('onboarding-claim'),
              onPressed: () => Navigator.of(context).openClaim(),
              icon: const Icon(Icons.qr_code_scanner),
              label: const Text('Thêm Smart Home'),
            ),
            const SizedBox(height: 12),
            OutlinedButton.icon(
              key: const ValueKey<String>('onboarding-invitations'),
              onPressed: () => Navigator.of(context).openMyInvitations(),
              icon: const Icon(Icons.mail_outline),
              label: Text(
                invitations > 0
                    ? 'Lời mời của tôi ($invitations)'
                    : 'Lời mời của tôi',
              ),
            ),
          ],
        ),
      ),
    );
  }
}
