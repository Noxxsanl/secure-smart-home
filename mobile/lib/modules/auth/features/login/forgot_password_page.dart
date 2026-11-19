import 'package:flutter/material.dart';

import '../../../../core/theme/app_theme.dart';

/// "Quên mật khẩu" (FR-1.6, COULD): there is no email/SMS reset yet, so the
/// page says plainly how to get access back instead of pretending a link was
/// sent. Same content as the web customer portal.
class ForgotPasswordPage extends StatelessWidget {
  const ForgotPasswordPage({super.key});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Quên mật khẩu')),
      body: SafeArea(
        child: Center(
          child: SingleChildScrollView(
            padding: const EdgeInsets.all(24),
            child: ConstrainedBox(
              constraints: const BoxConstraints(maxWidth: 420),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  const Icon(
                    Icons.vpn_key_outlined,
                    size: 72,
                    color: AppColors.primary,
                  ),
                  const SizedBox(height: 16),
                  const Text(
                    'Khôi phục tài khoản',
                    textAlign: TextAlign.center,
                    style: TextStyle(fontSize: 22, fontWeight: FontWeight.bold),
                  ),
                  const SizedBox(height: 20),
                  const Text.rich(
                    TextSpan(
                      children: [
                        TextSpan(
                          text: 'Tính năng tự đặt lại mật khẩu qua email/SMS ',
                        ),
                        TextSpan(
                          text: 'chưa được hỗ trợ',
                          style: TextStyle(fontWeight: FontWeight.bold),
                        ),
                        TextSpan(text: ' trong phiên bản này.'),
                      ],
                    ),
                  ),
                  const SizedBox(height: 16),
                  const _Bullet(
                    child: Text.rich(
                      TextSpan(
                        children: [
                          TextSpan(
                            text:
                                'Nếu bạn vẫn đang đăng nhập ở một thiết bị '
                                'khác, hãy vào ',
                          ),
                          TextSpan(
                            text: 'Hồ sơ → Đổi mật khẩu',
                            style: TextStyle(fontWeight: FontWeight.bold),
                          ),
                          TextSpan(text: '.'),
                        ],
                      ),
                    ),
                  ),
                  const SizedBox(height: 10),
                  const _Bullet(
                    child: Text.rich(
                      TextSpan(
                        children: [
                          TextSpan(
                            text:
                                'Nếu không, hãy liên hệ bộ phận hỗ trợ khách '
                                'hàng, cung cấp email đã đăng ký và mã người '
                                'dùng (dạng ',
                          ),
                          TextSpan(
                            text: 'ten#1234',
                            style: TextStyle(fontFamily: 'monospace'),
                          ),
                          TextSpan(
                            text:
                                ', xem ở trang Hồ sơ) để được hỗ trợ đặt lại '
                                'mật khẩu.',
                          ),
                        ],
                      ),
                    ),
                  ),
                  const SizedBox(height: 16),
                  const Text(
                    'Nhân viên hỗ trợ không bao giờ hỏi mật khẩu của bạn.',
                    style: TextStyle(
                      fontSize: 12,
                      color: AppColors.textSecondary,
                    ),
                  ),
                  const SizedBox(height: 28),
                  FilledButton(
                    key: const ValueKey<String>('forgot-password-back'),
                    onPressed: () => Navigator.of(context).maybePop(),
                    child: const Text('Quay lại đăng nhập'),
                  ),
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }
}

class _Bullet extends StatelessWidget {
  const _Bullet({required this.child});

  final Widget child;

  @override
  Widget build(BuildContext context) {
    return Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        const Padding(
          padding: EdgeInsets.only(top: 1, right: 8),
          child: Text('•'),
        ),
        Expanded(child: child),
      ],
    );
  }
}
