import 'package:flutter/material.dart';

import '../../models/room.dart';

class RoomDetailPage extends StatelessWidget {
  const RoomDetailPage({super.key, required this.room});

  final Room room;

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: Text(room.name)),
      body: Center(
        child: Padding(
          padding: const EdgeInsets.all(24),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Icon(room.icon, size: 80, color: Colors.blue),
              const SizedBox(height: 20),
              Text(
                room.name,
                style: Theme.of(context).textTheme.headlineMedium,
              ),
              const SizedBox(height: 12),
              const Text('Chưa có thiết bị nào trong phòng này.'),
            ],
          ),
        ),
      ),
    );
  }
}
