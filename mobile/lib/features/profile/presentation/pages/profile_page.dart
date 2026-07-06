import 'package:flutter/material.dart';

import '../../../auth/models/mock_user.dart';

class ProfilePage extends StatelessWidget {
  const ProfilePage({super.key, required this.user});

  final MockUser user;

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        automaticallyImplyLeading: false,
        title: const Text('Profile'),
      ),
      body: Center(
        child: Padding(
          padding: const EdgeInsets.all(24),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              const CircleAvatar(radius: 48, child: Icon(Icons.person, size: 52)),
              const SizedBox(height: 20),
              Text(
                user.email,
                style: Theme.of(context).textTheme.titleLarge,
                textAlign: TextAlign.center,
              ),
              const SizedBox(height: 8),
              Text('Vai trò: ${user.role}'),
              const SizedBox(height: 28),
              OutlinedButton.icon(
                onPressed: () => Navigator.of(context).pop(),
                icon: const Icon(Icons.logout),
                label: const Text('Đăng xuất 123456'),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
