import 'package:flutter/material.dart';

import '../../models/room.dart';
import '../widgets/room_card.dart';
import 'room_detail_page.dart';

class RoomListPage extends StatelessWidget {
  const RoomListPage({super.key});

  static const _rooms = [
    Room(name: 'Phòng khách', icon: Icons.weekend_outlined),
    Room(name: 'Phòng ngủ', icon: Icons.bed_outlined),
    Room(name: 'Phòng bếp', icon: Icons.kitchen_outlined),
    Room(name: 'Cửa', icon: Icons.door_front_door_outlined),
  ];

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        automaticallyImplyLeading: false,
        title: const Text('Room'),
      ),
      body: Padding(
        padding: const EdgeInsets.all(20),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              'Các phòng',
              style: Theme.of(context).textTheme.headlineSmall?.copyWith(
                    fontWeight: FontWeight.bold,
                  ),
            ),
            const SizedBox(height: 20),
            Expanded(
              child: GridView.builder(
                itemCount: _rooms.length,
                gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
                  crossAxisCount: 2,
                  mainAxisSpacing: 16,
                  crossAxisSpacing: 16,
                  childAspectRatio: 1.1,
                ),
                itemBuilder: (context, index) {
                  final room = _rooms[index];

                  return RoomCard(
                    room: room,
                    onTap: () => Navigator.of(context).push(
                      MaterialPageRoute<void>(
                        builder: (_) => RoomDetailPage(room: room),
                      ),
                    ),
                  );
                },
              ),
            ),
          ],
        ),
      ),
    );
  }
}
