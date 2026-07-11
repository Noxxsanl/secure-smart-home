import 'package:flutter/material.dart';

enum DeviceType { toggle, temperature }

class Device {
  const Device({
    required this.id,
    required this.name,
    required this.subtitle,
    required this.icon,
    required this.roomIds,
    required this.type,
    this.isOn = false,
    this.temperature = 22,
    this.minTemperature = 16,
    this.maxTemperature = 30,
    this.humidity = 50,
    this.powerUsage = 0,
    this.description = '',
  });

  final String id;
  final String name;
  final String subtitle;
  final IconData icon;
  final List<String> roomIds;
  final DeviceType type;
  final bool isOn;
  final double temperature;
  final double minTemperature;
  final double maxTemperature;
  final int humidity;
  final int powerUsage;
  final String description;

  Device copyWith({bool? isOn, double? temperature}) {
    return Device(
      id: id,
      name: name,
      subtitle: subtitle,
      icon: icon,
      roomIds: roomIds,
      type: type,
      isOn: isOn ?? this.isOn,
      temperature: temperature ?? this.temperature,
      minTemperature: minTemperature,
      maxTemperature: maxTemperature,
      humidity: humidity,
      powerUsage: powerUsage,
      description: description,
    );
  }
}
