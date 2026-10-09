import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../../core/network/error_messages.dart';
import '../../../../core/theme/app_theme.dart';
import '../../../../core/widgets/app_feedback.dart';
import '../../../../core/widgets/app_widgets.dart';
import '../../../homes/domain/home_role.dart';
import '../../../homes/presentation/providers/homes_providers.dart';
import '../../domain/member.dart';
import '../providers/members_providers.dart';
import '../widgets/guest_access_fields.dart';

/// Invite a member (FR-6.2, 6.3): email, name, role; GUEST needs an expiry
/// (≤30 days) and at least one device.
class InviteMemberPage extends ConsumerStatefulWidget {
  const InviteMemberPage({super.key, required this.homeId});

  final int homeId;

  @override
  ConsumerState<InviteMemberPage> createState() => _InviteMemberPageState();
}

class _InviteMemberPageState extends ConsumerState<InviteMemberPage> {
  final _formKey = GlobalKey<FormState>();
  final _nameController = TextEditingController();
  final _emailController = TextEditingController();
  HomeRole _role = HomeRole.controller;
  int _days = 7;
  Set<int> _devices = {};
  String? _deviceError;
  bool _busy = false;

  static final _emailPattern = RegExp(r'^[^@\s]+@[^@\s]+\.[^@\s]+$');

  @override
  void dispose() {
    _nameController.dispose();
    _emailController.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    final valid = _formKey.currentState!.validate();
    final isGuest = _role == HomeRole.guest;
    final devicesOk = !isGuest || _devices.isNotEmpty;
    setState(
      () => _deviceError = devicesOk ? null : 'Chọn ít nhất một thiết bị',
    );
    if (!valid || !devicesOk || _busy) return;
    setState(() => _busy = true);
    final input = InviteInput(
      email: _emailController.text,
      name: _nameController.text,
      role: _role,
      expiresAt: isGuest ? DateTime.now().add(Duration(days: _days)) : null,
      deviceIds: isGuest ? _devices.toList() : null,
    );
    final email = _emailController.text.trim();
    final ok = await runAction(
      context,
      () => ref.read(membersProvider(widget.homeId).notifier).invite(input),
      errorContext: ErrorContext.members,
      successMessage: 'Đã gửi lời mời tới $email.',
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
    final devices =
        ref.watch(homeOverviewProvider(widget.homeId)).value?.devices ??
        const [];
    return Scaffold(
      appBar: AppBar(title: const Text('Mời thành viên')),
      body: SafeArea(
        child: Form(
          key: _formKey,
          child: ListView(
            padding: const EdgeInsets.fromLTRB(20, 4, 20, 28),
            children: [
              TextFormField(
                controller: _nameController,
                textCapitalization: TextCapitalization.words,
                textInputAction: TextInputAction.next,
                decoration: const InputDecoration(
                  labelText: 'Tên thành viên',
                  prefixIcon: Icon(Icons.person_outline),
                ),
                validator: (v) {
                  final t = v?.trim() ?? '';
                  if (t.isEmpty) return 'Vui lòng nhập tên';
                  if (t.length > 128) return 'Tên tối đa 128 ký tự';
                  return null;
                },
              ),
              const SizedBox(height: 14),
              TextFormField(
                controller: _emailController,
                keyboardType: TextInputType.emailAddress,
                textInputAction: TextInputAction.done,
                decoration: const InputDecoration(
                  labelText: 'Email người được mời',
                  prefixIcon: Icon(Icons.email_outlined),
                ),
                validator: (v) {
                  final t = v?.trim() ?? '';
                  if (t.isEmpty) return 'Vui lòng nhập email';
                  if (t.length > 190 || !_emailPattern.hasMatch(t)) {
                    return 'Email không hợp lệ';
                  }
                  return null;
                },
              ),
              const SizedBox(height: 20),
              const SectionHeader('Vai trò'),
              Wrap(
                spacing: 8,
                runSpacing: 8,
                children: [
                  for (final role in HomeRole.invitable)
                    ChoicePill(
                      label: role.label,
                      selected: _role == role,
                      onTap: () => setState(() => _role = role),
                    ),
                ],
              ),
              const SizedBox(height: 8),
              Text(
                _role.description,
                style: const TextStyle(
                  color: AppColors.textSecondary,
                  fontSize: 13,
                ),
              ),
              if (_role == HomeRole.guest) ...[
                const SizedBox(height: 20),
                GuestAccessFields(
                  devices: devices,
                  days: _days,
                  selected: _devices,
                  onDaysChanged: (d) => setState(() => _days = d),
                  onSelectionChanged: (s) => setState(() {
                    _devices = s;
                    _deviceError = null;
                  }),
                  error: _deviceError,
                ),
              ],
              const SizedBox(height: 24),
              const InlineBanner(
                message:
                    'Lời mời có hiệu lực 7 ngày. Người được mời cần đăng ký/đăng nhập bằng đúng email này và chấp nhận trong mục "Lời mời của tôi".',
              ),
              const SizedBox(height: 20),
              FilledButton(
                onPressed: _busy ? null : _submit,
                child: const Text('GỬI LỜI MỜI'),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
