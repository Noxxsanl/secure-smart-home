import 'package:flutter/material.dart';

import '../../../../core/theme/app_theme.dart';
import '../../../devices/data/mock_devices.dart';
import '../../../devices/models/device.dart';
import '../../../devices/presentation/pages/device_control_page.dart';
import '../../../devices/presentation/widgets/circular_gauge.dart';
import '../../models/room.dart';

class RoomDetailPage extends StatefulWidget {
  const RoomDetailPage({super.key, required this.room});

  final Room room;

  @override
  State<RoomDetailPage> createState() => _RoomDetailPageState();
}

class _RoomDetailPageState extends State<RoomDetailPage> {
  late double _temperature = widget.room.temperature;
  late List<Device> _devices = MockDevices.forRoom(widget.room.id);

  void _toggleDevice(Device device, bool isOn) {
    setState(() {
      _devices = _devices
          .map((d) => d.id == device.id ? d.copyWith(isOn: isOn) : d)
          .toList();
    });
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: Text(widget.room.name),
        actions: const [
          Padding(
            padding: EdgeInsets.only(right: 12),
            child: Icon(Icons.edit_outlined),
          ),
        ],
      ),
      body: SafeArea(
        child: ListView(
          padding: const EdgeInsets.fromLTRB(20, 8, 20, 24),
          children: [
            Center(
              child: CircularGauge(
                value: _temperature,
                min: 12,
                max: 32,
                size: 220,
                onChanged: (value) => setState(() => _temperature = value),
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Text(
                      '${_temperature.round()}°',
                      style: const TextStyle(
                        fontSize: 40,
                        fontWeight: FontWeight.bold,
                        color: AppColors.textPrimary,
                      ),
                    ),
                    const Text(
                      'Temperature',
                      style: TextStyle(color: AppColors.textSecondary),
                    ),
                  ],
                ),
              ),
            ),
            const SizedBox(height: 24),
            Row(
              children: [
                _StatTile(
                  label: 'Felt temp',
                  value: '${(_temperature - 2).round()}°',
                ),
                _StatTile(
                  label: 'Humidity',
                  value: '${widget.room.humidity}%',
                ),
                _StatTile(
                  label: 'Power usage',
                  value: '${widget.room.powerUsage} Kw',
                ),
              ],
            ),
            const SizedBox(height: 28),
            const Text(
              'All Devices',
              style: TextStyle(fontSize: 18, fontWeight: FontWeight.bold),
            ),
            const SizedBox(height: 12),
            if (_devices.isEmpty)
              const Padding(
                padding: EdgeInsets.symmetric(vertical: 24),
                child: Text(
                  'Chưa có thiết bị nào trong phòng này.',
                  style: TextStyle(color: AppColors.textSecondary),
                ),
              )
            else
              ..._devices.map(
                (device) => Padding(
                  padding: const EdgeInsets.only(bottom: 12),
                  child: _DeviceRow(
                    device: device,
                    onToggle: (value) => _toggleDevice(device, value),
                    onTap: () => Navigator.of(context).push(
                      MaterialPageRoute<void>(
                        builder: (_) => DeviceControlPage(device: device),
                      ),
                    ),
                  ),
                ),
              ),
          ],
        ),
      ),
    );
  }
}

class _StatTile extends StatelessWidget {
  const _StatTile({required this.label, required this.value});

  final String label;
  final String value;

  @override
  Widget build(BuildContext context) {
    return Expanded(
      child: Column(
        children: [
          Text(
            value,
            style: const TextStyle(
              fontSize: 18,
              fontWeight: FontWeight.bold,
              color: AppColors.textPrimary,
            ),
          ),
          const SizedBox(height: 4),
          Text(
            label,
            style: const TextStyle(fontSize: 12, color: AppColors.textSecondary),
          ),
        ],
      ),
    );
  }
}

class _DeviceRow extends StatelessWidget {
  const _DeviceRow({
    required this.device,
    required this.onToggle,
    required this.onTap,
  });

  final Device device;
  final ValueChanged<bool> onToggle;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return Material(
      color: AppColors.surface,
      borderRadius: BorderRadius.circular(18),
      child: InkWell(
        borderRadius: BorderRadius.circular(18),
        onTap: onTap,
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
          child: Row(
            children: [
              Container(
                padding: const EdgeInsets.all(10),
                decoration: BoxDecoration(
                  color: AppColors.surfaceTint,
                  borderRadius: BorderRadius.circular(14),
                ),
                child: Icon(device.icon, color: AppColors.primary),
              ),
              const SizedBox(width: 14),
              Expanded(
                child: Text(
                  device.name,
                  style: const TextStyle(fontWeight: FontWeight.w600),
                ),
              ),
              Switch(value: device.isOn, onChanged: onToggle),
            ],
          ),
        ),
      ),
    );
  }
}
