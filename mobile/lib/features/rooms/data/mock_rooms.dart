import 'package:flutter/material.dart';

import '../models/room.dart';

class MockRooms {
  const MockRooms._();

  static const livingRoom = Room(
    id: 'living_room',
    name: 'Living room',
    icon: Icons.weekend_outlined,
    temperature: 16,
    humidity: 45,
    powerUsage: 310,
  );

  static const bedroom = Room(
    id: 'bedroom',
    name: 'Bedroom',
    icon: Icons.bed_outlined,
    temperature: 29,
    humidity: 34,
    powerUsage: 240,
  );

  static const kitchen = Room(
    id: 'kitchen',
    name: 'Kitchen',
    icon: Icons.kitchen_outlined,
    temperature: 21,
    humidity: 40,
    powerUsage: 180,
  );

  static const bathroom = Room(
    id: 'bathroom',
    name: 'Bathroom',
    icon: Icons.bathtub_outlined,
    temperature: 23,
    humidity: 60,
    powerUsage: 60,
    hasClimateData: false,
  );

  static const all = <Room>[livingRoom, bedroom, kitchen, bathroom];
}
