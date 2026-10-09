import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../../core/network/error_messages.dart';
import '../../../../core/widgets/app_widgets.dart';
import '../../../auth/presentation/providers/auth_providers.dart';
import '../providers/profile_providers.dart';

/// Change password (`POST /me/password`). The server revokes every refresh
/// token afterwards, so the app signs out and asks for the new password.
class ChangePasswordPage extends ConsumerStatefulWidget {
  const ChangePasswordPage({super.key});

  @override
  ConsumerState<ChangePasswordPage> createState() => _ChangePasswordPageState();
}

class _ChangePasswordPageState extends ConsumerState<ChangePasswordPage> {
  final _formKey = GlobalKey<FormState>();
  final _current = TextEditingController();
  final _next = TextEditingController();
  final _confirm = TextEditingController();
  bool _busy = false;
  String? _error;

  @override
  void dispose() {
    _current.dispose();
    _next.dispose();
    _confirm.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    if (_busy || !_formKey.currentState!.validate()) return;
    FocusScope.of(context).unfocus();
    setState(() {
      _busy = true;
      _error = null;
    });
    final navigator = Navigator.of(context);
    final auth = ref.read(authControllerProvider.notifier);
    try {
      await ref
          .read(profileRepositoryProvider)
          .changePassword(currentPassword: _current.text, newPassword: _next.text);
      navigator.popUntil((route) => route.isFirst);
      await auth.signOutLocally(
        notice:
            'Đã đổi mật khẩu. Vì lý do bảo mật, hãy đăng nhập lại bằng mật khẩu mới.',
      );
    } on Object catch (error) {
      if (!mounted) return;
      setState(() {
        _error = userMessageFor(error, context: ErrorContext.changePassword);
        _busy = false;
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Đổi mật khẩu')),
      body: Form(
        key: _formKey,
        child: ListView(
          padding: const EdgeInsets.fromLTRB(20, 4, 20, 28),
          children: [
            TextFormField(
              controller: _current,
              obscureText: true,
              decoration: const InputDecoration(
                labelText: 'Mật khẩu hiện tại',
                prefixIcon: Icon(Icons.lock_outline),
              ),
              validator: (v) =>
                  (v == null || v.isEmpty) ? 'Vui lòng nhập mật khẩu hiện tại' : null,
            ),
            const SizedBox(height: 14),
            TextFormField(
              controller: _next,
              obscureText: true,
              decoration: const InputDecoration(
                labelText: 'Mật khẩu mới (8–128 ký tự)',
                prefixIcon: Icon(Icons.lock_outlined),
              ),
              validator: (v) {
                final t = v ?? '';
                if (t.length < 8) return 'Mật khẩu mới cần ít nhất 8 ký tự';
                if (t.length > 128) return 'Mật khẩu mới tối đa 128 ký tự';
                return null;
              },
            ),
            const SizedBox(height: 14),
            TextFormField(
              controller: _confirm,
              obscureText: true,
              decoration: const InputDecoration(
                labelText: 'Nhập lại mật khẩu mới',
                prefixIcon: Icon(Icons.lock_reset_outlined),
              ),
              validator: (v) =>
                  v == _next.text ? null : 'Mật khẩu nhập lại chưa khớp',
            ),
            if (_error != null) ...[
              const SizedBox(height: 16),
              InlineBanner(message: _error!, kind: BannerKind.error),
            ],
            const SizedBox(height: 20),
            const InlineBanner(
              message:
                  'Sau khi đổi mật khẩu, bạn sẽ được đăng xuất khỏi mọi thiết bị.',
            ),
            const SizedBox(height: 20),
            FilledButton(
              onPressed: _busy ? null : _submit,
              child: const Text('ĐỔI MẬT KHẨU'),
            ),
          ],
        ),
      ),
    );
  }
}
