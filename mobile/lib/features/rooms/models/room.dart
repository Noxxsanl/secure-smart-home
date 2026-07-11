import 'package:flutter/material.dart';

class Room {
  const Room({
    required this.id,
    required this.name,
    required this.icon,
    this.temperature = 24,
    this.humidity = 50,
    this.powerUsage = 0,
    this.hasClimateData = true,
  });

  final String id;
  final String name;
  final IconData icon;
  final double temperature;
  final int humidity;
  final int powerUsage;
  final bool hasClimateData;
}
