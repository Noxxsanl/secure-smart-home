import 'package:flutter/material.dart';

import '../../../../core/theme/app_theme.dart';
import '../../models/device.dart';
import '../widgets/circular_gauge.dart';

class DeviceControlPage extends StatefulWidget {
  const DeviceControlPage({super.key, required this.device});

  final Device device;

  @override
  State<DeviceControlPage> createState() => _DeviceControlPageState();
}

class _DeviceControlPageState extends State<DeviceControlPage> {
  late Device _device = widget.device;

  void _saveTemperature() {
    ScaffoldMessenger.of(context)
      ..hideCurrentSnackBar()
      ..showSnackBar(
        SnackBar(
          content: Text('Saved ${_device.temperature.round()}° for ${_device.name}'),
          backgroundColor: AppColors.primary,
        ),
      );
  }

  @override
  Widget build(BuildContext context) {
    final isTemperature = _device.type == DeviceType.temperature;

    return Scaffold(
      appBar: AppBar(title: Text(_device.name)),
      body: SafeArea(
        child: SingleChildScrollView(
          padding: const EdgeInsets.fromLTRB(20, 0, 20, 24),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              if (isTemperature) ...[
                const SizedBox(height: 12),
                Center(
                  child: CircularGauge(
                    value: _device.temperature,
                    min: _device.minTemperature,
                    max: _device.maxTemperature,
                    size: 240,
                    onChanged: _device.isOn
                        ? (value) => setState(
                              () => _device = _device.copyWith(
                                temperature: value,
                              ),
                            )
                        : null,
                    child: Column(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        Text(
                          '${_device.temperature.round()}°',
                          style: const TextStyle(
                            fontSize: 44,
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
                const SizedBox(height: 28),
              ] else ...[
                const SizedBox(height: 24),
                Center(
                  child: Container(
                    width: 120,
                    height: 120,
                    decoration: BoxDecoration(
                      color: _device.isOn
                          ? AppColors.primary
                          : AppColors.surfaceTint,
                      shape: BoxShape.circle,
                    ),
                    child: Icon(
                      _device.icon,
                      size: 56,
                      color: _device.isOn ? Colors.white : AppColors.primary,
                    ),
                  ),
                ),
                const SizedBox(height: 28),
              ],
              Row(
                children: [
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          _device.name,
                          style: const TextStyle(
                            fontSize: 20,
                            fontWeight: FontWeight.bold,
                          ),
                        ),
                        Text(
                          _device.subtitle,
                          style: const TextStyle(
                            color: AppColors.textSecondary,
                          ),
                        ),
                      ],
                    ),
                  ),
                  Switch(
                    value: _device.isOn,
                    onChanged: (value) =>
                        setState(() => _device = _device.copyWith(isOn: value)),
                  ),
                ],
              ),
              if (_device.description.isNotEmpty) ...[
                const SizedBox(height: 20),
                Text(
                  _device.description,
                  style: const TextStyle(
                    color: AppColors.textSecondary,
                    height: 1.5,
                  ),
                ),
              ],
              if (isTemperature) ...[
                const SizedBox(height: 28),
                Row(
                  children: [
                    _StatTile(label: 'Felt temp', value: '${(_device.temperature - 2).round()}°'),
                    _StatTile(label: 'Humidity', value: '${_device.humidity}%'),
                    _StatTile(label: 'Power usage', value: '${_device.powerUsage} Kw'),
                  ],
                ),
              ],
              const SizedBox(height: 32),
              FilledButton(
                onPressed: _saveTemperature,
                child: Text(
                  isTemperature ? 'Save Temperature' : 'Save',
                ),
              ),
            ],
          ),
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
            style: const TextStyle(
              fontSize: 12,
              color: AppColors.textSecondary,
            ),
          ),
        ],
      ),
    );
  }
}
