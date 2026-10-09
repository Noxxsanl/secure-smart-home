import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../../core/theme/app_theme.dart';
import '../../../../core/widgets/app_widgets.dart';
import '../../../claim/presentation/pages/claim_page.dart';
import '../../../members/presentation/pages/my_invitations_page.dart';
import '../../../members/presentation/providers/members_providers.dart';
import '../../domain/home.dart';
import '../providers/homes_providers.dart';

/// App-bar title of the Home tab: current home name + role, opens the switcher.
class HomeSwitcherButton extends ConsumerWidget {
  const HomeSwitcherButton({super.key, required this.home});

  final MyHome home;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    return InkWell(
      key: const ValueKey<String>('home-switcher'),
      borderRadius: BorderRadius.circular(12),
      onTap: () => showHomeSwitcherSheet(context),
      child: Padding(
        padding: const EdgeInsets.symmetric(vertical: 6, horizontal: 4),
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            Flexible(
              child: Text(
                home.home.name,
                overflow: TextOverflow.ellipsis,
                style: const TextStyle(
                  fontSize: 20,
                  fontWeight: FontWeight.bold,
                  color: AppColors.textPrimary,
                ),
              ),
            ),
            const SizedBox(width: 4),
            const Icon(Icons.keyboard_arrow_down, color: AppColors.textPrimary),
          ],
        ),
      ),
    );
  }
}

Future<void> showHomeSwitcherSheet(BuildContext context) {
  return showModalBottomSheet<void>(
    context: context,
    backgroundColor: AppColors.background,
    isScrollControlled: true,
    shape: const RoundedRectangleBorder(
      borderRadius: BorderRadius.vertical(top: Radius.circular(24)),
    ),
    builder: (_) => const _HomeSwitcherSheet(),
  );
}

class _HomeSwitcherSheet extends ConsumerWidget {
  const _HomeSwitcherSheet();

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final state = ref.watch(homesProvider).value;
    final invitations = ref.watch(invitationsProvider).value?.length ?? 0;
    final navigator = Navigator.of(context);

    return SafeArea(
      child: Padding(
        padding: const EdgeInsets.fromLTRB(20, 20, 20, 12),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const Text(
              'Chọn Smart Home',
              style: TextStyle(fontSize: 18, fontWeight: FontWeight.bold),
            ),
            const SizedBox(height: 12),
            Flexible(
              child: ListView(
                shrinkWrap: true,
                children: [
                  for (final h in state?.homes ?? const <MyHome>[])
                    Padding(
                      padding: const EdgeInsets.only(bottom: 8),
                      child: AppCard(
                        radius: 18,
                        padding: const EdgeInsets.all(12),
                        onTap: () {
                          ref.read(homesProvider.notifier).select(h.id);
                          navigator.pop();
                        },
                        child: Row(
                          children: [
                            const IconBadge(icon: Icons.home_outlined),
                            const SizedBox(width: 12),
                            Expanded(
                              child: Column(
                                crossAxisAlignment: CrossAxisAlignment.start,
                                children: [
                                  Text(
                                    h.home.name,
                                    style: const TextStyle(
                                      fontWeight: FontWeight.bold,
                                    ),
                                  ),
                                  Text(
                                    '${h.role.label} · ${h.onlineCount}/${h.deviceCount} thiết bị online',
                                    style: const TextStyle(
                                      fontSize: 12,
                                      color: AppColors.textSecondary,
                                    ),
                                  ),
                                ],
                              ),
                            ),
                            if (h.id == state?.current?.id)
                              const Icon(
                                Icons.check_circle,
                                color: AppColors.primary,
                              ),
                          ],
                        ),
                      ),
                    ),
                ],
              ),
            ),
            const SizedBox(height: 4),
            ListTile(
              contentPadding: EdgeInsets.zero,
              leading: const IconBadge(icon: Icons.add_home_outlined),
              title: const Text('Thêm Smart Home'),
              onTap: () {
                navigator.pop();
                navigator.push(
                  MaterialPageRoute<void>(builder: (_) => const ClaimPage()),
                );
              },
            ),
            ListTile(
              contentPadding: EdgeInsets.zero,
              leading: const IconBadge(icon: Icons.mail_outline),
              title: const Text('Lời mời của tôi'),
              trailing: invitations > 0
                  ? StatusPill('$invitations', color: AppColors.warning)
                  : null,
              onTap: () {
                navigator.pop();
                navigator.push(
                  MaterialPageRoute<void>(
                    builder: (_) => const MyInvitationsPage(),
                  ),
                );
              },
            ),
          ],
        ),
      ),
    );
  }
}
