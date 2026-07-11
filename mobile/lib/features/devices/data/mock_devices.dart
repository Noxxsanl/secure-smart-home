import 'package:flutter/material.dart';

import '../../rooms/data/mock_rooms.dart';
import '../models/device.dart';

class MockDevices {
  const MockDevices._();

  static final all = <Device>[
    Device(
      id: 'vacuum',
      name: 'Vacuum',
      subtitle: 'Cleaning robot',
      icon: Icons.cleaning_services_outlined,
      roomIds: [MockRooms.livingRoom.id],
      type: DeviceType.toggle,
      isOn: false,
    ),
    Device(
      id: 'ac',
      name: 'Air Conditioning',
      subtitle: 'Cras elit nibh',
      icon: Icons.ac_unit,
      roomIds: [
        MockRooms.livingRoom.id,
        MockRooms.bedroom.id,
        MockRooms.kitchen.id,
      ],
      type: DeviceType.temperature,
      isOn: true,
      temperature: 18,
      minTemperature: 16,
      maxTemperature: 30,
      humidity: 34,
      powerUsage: 240,
      description:
          'Morbi sed risus magna. Donec blandit, erat sit amet '
          'pharetra tincidunt convallis, neque nisi molestie odio, '
          'sit amet lacinia est nunc ut accum bibendum.',
    ),
    Device(
      id: 'curtains',
      name: 'Automatic Curtains',
      subtitle: 'Proin aliquet',
      icon: Icons.curtains_closed_outlined,
      roomIds: [MockRooms.bedroom.id, MockRooms.livingRoom.id],
      type: DeviceType.toggle,
      isOn: true,
    ),
    Device(
      id: 'irrigation',
      name: 'Automatic Irrigation',
      subtitle: 'Lacus scelerisque',
      icon: Icons.grass_outlined,
      roomIds: [MockRooms.livingRoom.id, MockRooms.kitchen.id],
      type: DeviceType.toggle,
      isOn: false,
    ),
    Device(
      id: 'speakers',
      name: 'Speakers',
      subtitle: 'Integer gravida',
      icon: Icons.speaker_outlined,
      roomIds: [MockRooms.livingRoom.id],
      type: DeviceType.toggle,
      isOn: false,
    ),
    Device(
      id: 'lightings',
      name: 'Lightings',
      subtitle: 'Ornare aliquam',
      icon: Icons.lightbulb_outline,
      roomIds: [MockRooms.livingRoom.id, MockRooms.kitchen.id],
      type: DeviceType.toggle,
      isOn: true,
    ),
    Device(
      id: 'door_locks',
      name: 'Door locks',
      subtitle: 'Secure entry',
      icon: Icons.lock_outline,
      roomIds: [MockRooms.livingRoom.id],
      type: DeviceType.toggle,
      isOn: false,
    ),
  ];

  static List<Device> forRoom(String roomId) =>
      all.where((device) => device.roomIds.contains(roomId)).toList();
}
