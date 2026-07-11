import 'package:flutter/material.dart';

import '../../data/mock_rooms.dart';
import '../widgets/room_card.dart';
import 'room_detail_page.dart';

class RoomListPage extends StatelessWidget {
  const RoomListPage({super.key});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        automaticallyImplyLeading: false,
        title: const Text('Rooms'),
      ),
      body: Padding(
        padding: const EdgeInsets.fromLTRB(20, 0, 20, 20),
        child: GridView.builder(
          itemCount: MockRooms.all.length,
          gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
            crossAxisCount: 2,
            mainAxisSpacing: 16,
            crossAxisSpacing: 16,
            childAspectRatio: 1.1,
          ),
          itemBuilder: (context, index) {
            final room = MockRooms.all[index];

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
    );
  }
}
