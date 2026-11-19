import 'package:flutter/material.dart';

import '../../../../core/theme/app_theme.dart';

/// Shown while the stored session is verified. If the server cannot be
/// reached it explains why and offers a retry instead of logging the user out.
class SplashPage extends StatelessWidget {
  const SplashPage({super.key, this.message, this.onRetry, this.onSignOut});

  final String? message;
  final VoidCallback? onRetry;
  final VoidCallback? onSignOut;

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: SafeArea(
        child: Center(
          child: Padding(
            padding: const EdgeInsets.all(28),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                Container(
                  padding: const EdgeInsets.all(22),
                  decoration: BoxDecoration(
                    color: AppColors.primary,
                    borderRadius: BorderRadius.circular(28),
                  ),
                  child: const Icon(
                    Icons.home_filled,
                    size: 48,
                    color: Colors.white,
                  ),
                ),
                const SizedBox(height: 18),
                const Text(
                  'Smart Home IoT',
                  style: TextStyle(fontSize: 22, fontWeight: FontWeight.bold),
                ),
                const SizedBox(height: 28),
                if (message == null)
                  const CircularProgressIndicator()
                else ...[
                  Text(
                    message!,
                    textAlign: TextAlign.center,
                    style: const TextStyle(
                      color: AppColors.textPrimary,
                      height: 1.4,
                    ),
                  ),
                  const SizedBox(height: 20),
                  if (onRetry != null)
                    FilledButton.icon(
                      onPressed: onRetry,
                      icon: const Icon(Icons.refresh),
                      label: const Text('Thử lại'),
                    ),
                  if (onSignOut != null) ...[
                    const SizedBox(height: 8),
                    TextButton(
                      onPressed: onSignOut,
                      child: const Text('Đăng nhập bằng tài khoản khác'),
                    ),
                  ],
                ],
              ],
            ),
          ),
        ),
      ),
    );
  }
}
