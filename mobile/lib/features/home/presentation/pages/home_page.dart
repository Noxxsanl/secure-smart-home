import 'package:flutter/material.dart';

import '../../../../core/theme/app_theme.dart';
import '../../../auth/models/mock_user.dart';
import '../../../devices/data/mock_devices.dart';
import '../../../devices/models/device.dart';
import '../../../devices/presentation/pages/device_control_page.dart';
import '../../../devices/presentation/widgets/device_card.dart';
import '../../../rooms/data/mock_rooms.dart';
import '../../../rooms/models/room.dart';

class HomePage extends StatefulWidget {
  const HomePage({super.key, required this.user});

  final MockUser user;

  @override
  State<HomePage> createState() => _HomePageState();
}

class _HomePageState extends State<HomePage> {
  late List<Device> _devices = List.of(MockDevices.all);
  Room _selectedRoom = MockRooms.livingRoom;

  List<Device> get _visibleDevices =>
      _devices.where((d) => d.roomIds.contains(_selectedRoom.id)).toList();

  void _toggleDevice(Device device, bool isOn) {
    setState(() {
      _devices = _devices
          .map((d) => d.id == device.id ? d.copyWith(isOn: isOn) : d)
          .toList();
    });
  }

  Future<void> _openDevice(Device device) async {
    await Navigator.of(context).push(
      MaterialPageRoute<void>(
        builder: (_) => DeviceControlPage(device: device),
      ),
    );
  }

  String get _today {
    const months = [
      'January', 'February', 'March', 'April', 'May', 'June',
      'July', 'August', 'September', 'October', 'November', 'December',
    ];
    final now = DateTime.now();
    return '${now.day} ${months[now.month - 1]} ${now.year}';
  }

  @override
  Widget build(BuildContext context) {
    return SafeArea(
      child: CustomScrollView(
        slivers: [
          SliverPadding(
            padding: const EdgeInsets.fromLTRB(20, 12, 20, 0),
            sliver: SliverToBoxAdapter(
              child: Row(
                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                children: [
                  Container(
                    padding: const EdgeInsets.all(10),
                    decoration: BoxDecoration(
                      color: AppColors.surfaceTint,
                      borderRadius: BorderRadius.circular(14),
                    ),
                    child: const Icon(Icons.menu, color: AppColors.textPrimary),
                  ),
                  Text(
                    _today,
                    style: const TextStyle(
                      fontWeight: FontWeight.w600,
                      color: AppColors.textPrimary,
                    ),
                  ),
                  const SizedBox(width: 44),
                ],
              ),
            ),
          ),
          SliverPadding(
            padding: const EdgeInsets.fromLTRB(20, 20, 20, 0),
            sliver: SliverToBoxAdapter(
              child: Text(
                'Hello, ${widget.user.firstName}',
                style: const TextStyle(
                  fontSize: 24,
                  fontWeight: FontWeight.bold,
                  color: AppColors.textPrimary,
                ),
              ),
            ),
          ),
          SliverPadding(
            padding: const EdgeInsets.only(top: 20),
            sliver: SliverToBoxAdapter(
              child: SizedBox(
                height: 88,
                child: ListView.separated(
                  padding: const EdgeInsets.symmetric(horizontal: 20),
                  scrollDirection: Axis.horizontal,
                  itemCount: MockRooms.all.length,
                  separatorBuilder: (_, _) => const SizedBox(width: 12),
                  itemBuilder: (context, index) {
                    final room = MockRooms.all[index];
                    final isSelected = room.id == _selectedRoom.id;

                    return InkWell(
                      borderRadius: BorderRadius.circular(18),
                      onTap: () => setState(() => _selectedRoom = room),
                      child: Container(
                        width: 76,
                        padding: const EdgeInsets.symmetric(vertical: 10),
                        decoration: BoxDecoration(
                          color: isSelected
                              ? AppColors.primary
                              : AppColors.surface,
                          borderRadius: BorderRadius.circular(18),
                        ),
                        child: Column(
                          mainAxisAlignment: MainAxisAlignment.center,
                          children: [
                            Icon(
                              room.icon,
                              color: isSelected
                                  ? Colors.white
                                  : AppColors.primary,
                            ),
                            const SizedBox(height: 6),
                            Text(
                              room.name,
                              maxLines: 1,
                              overflow: TextOverflow.ellipsis,
                              textAlign: TextAlign.center,
                              style: TextStyle(
                                fontSize: 11,
                                fontWeight: FontWeight.w600,
                                color: isSelected
                                    ? Colors.white
                                    : AppColors.textSecondary,
                              ),
                            ),
                          ],
                        ),
                      ),
                    );
                  },
                ),
              ),
            ),
          ),
          SliverPadding(
            padding: const EdgeInsets.fromLTRB(20, 24, 20, 12),
            sliver: SliverToBoxAdapter(
              child: Row(
                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                children: [
                  const Text(
                    'All Devices',
                    style: TextStyle(fontSize: 18, fontWeight: FontWeight.bold),
                  ),
                  Container(
                    padding: const EdgeInsets.all(6),
                    decoration: BoxDecoration(
                      color: AppColors.surfaceTint,
                      borderRadius: BorderRadius.circular(10),
                    ),
                    child: const Icon(
                      Icons.add,
                      size: 18,
                      color: AppColors.primary,
                    ),
                  ),
                ],
              ),
            ),
          ),
          SliverPadding(
            padding: const EdgeInsets.fromLTRB(20, 0, 20, 24),
            sliver: SliverGrid(
              gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
                crossAxisCount: 2,
                mainAxisSpacing: 16,
                crossAxisSpacing: 16,
                childAspectRatio: 0.95,
              ),
              delegate: SliverChildBuilderDelegate(
                (context, index) {
                  final device = _visibleDevices[index];

                  return DeviceCard(
                    device: device,
                    onTap: () => _openDevice(device),
                    onToggle: (value) => _toggleDevice(device, value),
                  );
                },
                childCount: _visibleDevices.length,
              ),
            ),
          ),
        ],
      ),
    );
  }
}
