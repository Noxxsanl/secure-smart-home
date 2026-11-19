import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../core/network/error_messages.dart';
import '../modules/auth/auth.dart';
import '../modules/auth/auth_module.dart';
import '../modules/homes/homes.dart';
import '../modules/homes/homes_module.dart';
import 'shell/app_shell_page.dart';

/// Decides what to show: splash → login → (no homes) onboarding → shell.
class AppRoot extends ConsumerWidget {
  const AppRoot({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    // Any route pushed above the root is dropped when the session ends.
    ref.listen(authControllerProvider.select((s) => s.status), (_, status) {
      if (status == AuthStatus.unauthenticated) {
        Navigator.of(context).popUntil((route) => route.isFirst);
      }
    });

    final auth = ref.watch(authControllerProvider);
    final controller = ref.read(authControllerProvider.notifier);

    switch (auth.status) {
      case AuthStatus.checking:
        return const SplashPage();
      case AuthStatus.failed:
        return SplashPage(
          message: auth.error,
          onRetry: controller.restore,
          onSignOut: () => controller.signOutLocally(),
        );
      case AuthStatus.unauthenticated:
        return const LoginPage();
      case AuthStatus.authenticated:
        final homes = ref.watch(homesProvider);
        return homes.when(
          loading: () => const SplashPage(),
          error: (error, _) => SplashPage(
            message: userMessageFor(error),
            onRetry: () => ref.invalidate(homesProvider),
            onSignOut: () => controller.logout(),
          ),
          data: (state) =>
              state.isEmpty ? const OnboardingPage() : const AppShellPage(),
        );
    }
  }
}
