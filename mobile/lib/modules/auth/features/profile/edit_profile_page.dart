import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../../core/network/error_messages.dart';
import '../../../../core/widgets/app_feedback.dart';
import '../../../../core/widgets/async_views.dart';
import '../../application/profile_providers.dart';
import '../../domain/customer_profile.dart';

/// Edit full name, phone and address (`PATCH /me/profile`).
class EditProfilePage extends ConsumerWidget {
  const EditProfilePage({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final profile = ref.watch(profileProvider);
    return Scaffold(
      appBar: AppBar(title: const Text('Chỉnh sửa hồ sơ')),
      body: AsyncValueView<CustomerProfile>(
        value: profile,
        errorContext: ErrorContext.profile,
        onRetry: () => ref.invalidate(profileProvider),
        builder: (data) => _EditForm(profile: data),
      ),
    );
  }
}

class _EditForm extends ConsumerStatefulWidget {
  const _EditForm({required this.profile});

  final CustomerProfile profile;

  @override
  ConsumerState<_EditForm> createState() => _EditFormState();
}

class _EditFormState extends ConsumerState<_EditForm> {
  final _formKey = GlobalKey<FormState>();
  late final _name = TextEditingController(text: widget.profile.fullName);
  late final _phone = TextEditingController(text: widget.profile.phone ?? '');
  late final _address = TextEditingController(
    text: widget.profile.address ?? '',
  );
  bool _busy = false;

  static final _phonePattern = RegExp(r'^[0-9 +.\-]*$');

  @override
  void dispose() {
    _name.dispose();
    _phone.dispose();
    _address.dispose();
    super.dispose();
  }

  Future<void> _save() async {
    if (_busy || !_formKey.currentState!.validate()) return;
    setState(() => _busy = true);
    final ok = await runAction(
      context,
      () => ref
          .read(profileProvider.notifier)
          .save(
            fullName: _name.text,
            phone: _phone.text,
            address: _address.text,
          ),
      errorContext: ErrorContext.profile,
      successMessage: 'Đã lưu hồ sơ.',
    );
    if (!mounted) return;
    if (ok) {
      Navigator.of(context).pop();
    } else {
      setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Form(
      key: _formKey,
      child: ListView(
        padding: const EdgeInsets.fromLTRB(20, 4, 20, 28),
        children: [
          TextFormField(
            controller: _name,
            textCapitalization: TextCapitalization.words,
            decoration: const InputDecoration(
              labelText: 'Họ và tên',
              prefixIcon: Icon(Icons.person_outline),
            ),
            validator: (v) {
              final t = v?.trim() ?? '';
              return t.length < 2 || t.length > 128
                  ? 'Họ tên cần từ 2 đến 128 ký tự'
                  : null;
            },
          ),
          const SizedBox(height: 14),
          TextFormField(
            controller: _phone,
            keyboardType: TextInputType.phone,
            decoration: const InputDecoration(
              labelText: 'Số điện thoại',
              prefixIcon: Icon(Icons.phone_outlined),
            ),
            validator: (v) {
              final t = v?.trim() ?? '';
              return t.length > 20 || !_phonePattern.hasMatch(t)
                  ? 'Số điện thoại tối đa 20 ký tự, chỉ gồm số'
                  : null;
            },
          ),
          const SizedBox(height: 14),
          TextFormField(
            controller: _address,
            maxLength: 255,
            decoration: const InputDecoration(
              labelText: 'Địa chỉ',
              prefixIcon: Icon(Icons.location_on_outlined),
            ),
          ),
          const SizedBox(height: 20),
          FilledButton(
            onPressed: _busy ? null : _save,
            child: const Text('LƯU THAY ĐỔI'),
          ),
        ],
      ),
    );
  }
}
