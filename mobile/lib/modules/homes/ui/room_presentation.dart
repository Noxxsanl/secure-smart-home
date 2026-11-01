import 'package:flutter/material.dart';

/// Icon per `room_type` (contract §1.2).
IconData roomIcon(String roomType) => switch (roomType) {
  'living_room' => Icons.weekend_outlined,
  'bedroom' => Icons.bed_outlined,
  'kitchen' => Icons.kitchen_outlined,
  'bathroom' => Icons.bathtub_outlined,
  'office' => Icons.desk_outlined,
  'garage' => Icons.garage_outlined,
  'garden' => Icons.yard_outlined,
  'door' => Icons.door_front_door_outlined,
  _ => Icons.meeting_room_outlined,
};
