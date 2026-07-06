import 'package:flutter/material.dart';

class AboutPage extends StatelessWidget {
  const AboutPage({super.key});

  void _connectBluetooth(BuildContext context) {
    ScaffoldMessenger.of(context)
      ..hideCurrentSnackBar()
      ..showSnackBar(
        const SnackBar(
          content: Text(
            'Tính năng kết nối Bluetooth sẽ được hoàn thiện cùng OTA Gateway.',
          ),
        ),
      );
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        automaticallyImplyLeading: false,
        title: const Text('About'),
      ),
      body: ListView(
        padding: const EdgeInsets.all(24),
        children: [
          const Icon(Icons.info_outline, size: 80, color: Colors.blue),
          const SizedBox(height: 16),
          Text(
            'About',
            textAlign: TextAlign.center,
            style: Theme.of(context).textTheme.headlineMedium,
          ),
          const SizedBox(height: 12),
          const Text(
            'Ứng dụng quản lý hệ thống Smart Home IoT.',
            textAlign: TextAlign.center,
          ),
          const SizedBox(height: 32),
          Card(
            child: Padding(
              padding: const EdgeInsets.all(20),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  Row(
                    children: [
                      const Icon(Icons.system_update_alt, color: Colors.blue),
                      const SizedBox(width: 12),
                      Expanded(
                        child: Text(
                          'Cập nhật OTA cho ESP Gateway',
                          style: Theme.of(context).textTheme.titleMedium,
                        ),
                      ),
                    ],
                  ),
                  const SizedBox(height: 12),
                  const Text(
                    'Kết nối ứng dụng với ESP Gateway qua Bluetooth để kiểm tra '
                    'và cài đặt firmware mới trong phiên bản tương lai.',
                  ),
                  const SizedBox(height: 20),
                  FilledButton.icon(
                    key: const Key('connectBluetoothButton'),
                    onPressed: () => _connectBluetooth(context),
                    icon: const Icon(Icons.bluetooth),
                    label: const Text('Kết nối Bluetooth'),
                  ),
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }
}
