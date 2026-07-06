import 'package:flutter/material.dart';

import '../../../auth/models/mock_user.dart';

class HomePage extends StatelessWidget {
  const HomePage({super.key, required this.user});

  final MockUser user;

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(24),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            const CircleAvatar(
              radius: 54,
              child: Icon(Icons.admin_panel_settings, size: 62),
            ),
            const SizedBox(height: 24),
            const Text(
              'Hello Admin',
              textAlign: TextAlign.center,
              style: TextStyle(fontSize: 36, fontWeight: FontWeight.bold),
            ),
            const SizedBox(height: 12),
            Text(
              'Chào mừng ${user.email}',
              textAlign: TextAlign.center,
              style: Theme.of(context).textTheme.titleMedium,
            ),
            const SizedBox(height: 8),
            const Text(
              'Hãy chọn một chức năng ở thanh điều hướng bên dưới.',
              textAlign: TextAlign.center,
            ),
          ],
        ),
      ),
    );
  }
}
