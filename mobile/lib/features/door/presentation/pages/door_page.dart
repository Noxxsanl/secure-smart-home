import 'dart:async';

import 'package:flutter/material.dart';

import '../../../../core/theme/app_theme.dart';
import '../../../../core/widgets/settings_tile.dart';

class DoorPage extends StatefulWidget {
  const DoorPage({super.key});

  @override
  State<DoorPage> createState() => _DoorPageState();
}

class _DoorPageState extends State<DoorPage> {
  late Timer _clockTimer;
  DateTime _now = DateTime.now();
  bool _isDoorClosed = true;
  bool _isLocked = true;

  static const _months = [
    'Th1', 'Th2', 'Th3', 'Th4', 'Th5', 'Th6',
    'Th7', 'Th8', 'Th9', 'Th10', 'Th11', 'Th12',
  ];

  @override
  void initState() {
    super.initState();
    _clockTimer = Timer.periodic(
      const Duration(seconds: 1),
      (_) => setState(() => _now = DateTime.now()),
    );
  }

  @override
  void dispose() {
    _clockTimer.cancel();
    super.dispose();
  }

  String _twoDigits(int value) => value.toString().padLeft(2, '0');

  String get _timeLabel =>
      '${_twoDigits(_now.hour)}:${_twoDigits(_now.minute)}:${_twoDigits(_now.second)}';

  String get _dateLabel => '${_now.day} ${_months[_now.month - 1]}';

  void _showComingSoon(String feature) {
    ScaffoldMessenger.of(context)
      ..hideCurrentSnackBar()
      ..showSnackBar(
        SnackBar(content: Text('$feature sẽ khả dụng khi kết nối camera thật.')),
      );
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        automaticallyImplyLeading: false,
        title: const Text('Door'),
      ),
      body: SafeArea(
        child: ListView(
          padding: const EdgeInsets.fromLTRB(20, 8, 20, 24),
          children: [
            ClipRRect(
              borderRadius: BorderRadius.circular(24),
              child: SizedBox(
                height: 240,
                child: Stack(
                  fit: StackFit.expand,
                  children: [
                    Container(
                      decoration: const BoxDecoration(
                        gradient: LinearGradient(
                          begin: Alignment.topLeft,
                          end: Alignment.bottomRight,
                          colors: [Color(0xFF20243B), Color(0xFF11131F)],
                        ),
                      ),
                    ),
                    const Center(
                      child: Column(
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          Icon(
                            Icons.videocam_outlined,
                            size: 52,
                            color: Colors.white38,
                          ),
                          SizedBox(height: 8),
                          Text(
                            'Camera cổng chính',
                            style: TextStyle(color: Colors.white54, fontSize: 12),
                          ),
                        ],
                      ),
                    ),
                    Positioned(
                      top: 14,
                      left: 14,
                      child: Container(
                        padding: const EdgeInsets.symmetric(
                          horizontal: 10,
                          vertical: 6,
                        ),
                        decoration: BoxDecoration(
                          color: Colors.black.withValues(alpha: 0.4),
                          borderRadius: BorderRadius.circular(10),
                        ),
                        child: Row(
                          mainAxisSize: MainAxisSize.min,
                          children: const [
                            _BlinkingDot(),
                            SizedBox(width: 6),
                            Text(
                              'LIVE',
                              style: TextStyle(
                                color: Colors.white,
                                fontWeight: FontWeight.bold,
                                fontSize: 12,
                                letterSpacing: 0.5,
                              ),
                            ),
                          ],
                        ),
                      ),
                    ),
                    Positioned(
                      top: 14,
                      right: 14,
                      child: Container(
                        padding: const EdgeInsets.symmetric(
                          horizontal: 10,
                          vertical: 6,
                        ),
                        decoration: BoxDecoration(
                          color: Colors.black.withValues(alpha: 0.4),
                          borderRadius: BorderRadius.circular(10),
                        ),
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.end,
                          children: [
                            Text(
                              _timeLabel,
                              style: const TextStyle(
                                color: Colors.white,
                                fontWeight: FontWeight.bold,
                                fontSize: 14,
                              ),
                            ),
                            Text(
                              _dateLabel,
                              style: const TextStyle(
                                color: Colors.white70,
                                fontSize: 10,
                              ),
                            ),
                          ],
                        ),
                      ),
                    ),
                    Positioned(
                      right: 14,
                      bottom: 14,
                      child: InkWell(
                        borderRadius: BorderRadius.circular(10),
                        onTap: () => _showComingSoon('Xem toàn màn hình'),
                        child: Container(
                          padding: const EdgeInsets.all(8),
                          decoration: BoxDecoration(
                            color: Colors.black.withValues(alpha: 0.4),
                            borderRadius: BorderRadius.circular(10),
                          ),
                          child: const Icon(
                            Icons.fullscreen,
                            color: Colors.white,
                            size: 20,
                          ),
                        ),
                      ),
                    ),
                  ],
                ),
              ),
            ),
            const SizedBox(height: 20),
            Material(
              color: AppColors.surface,
              borderRadius: BorderRadius.circular(24),
              child: Padding(
                padding: const EdgeInsets.all(18),
                child: Column(
                  children: [
                    Row(
                      children: [
                        Container(
                          padding: const EdgeInsets.all(10),
                          decoration: BoxDecoration(
                            color: AppColors.surfaceTint,
                            borderRadius: BorderRadius.circular(14),
                          ),
                          child: const Icon(
                            Icons.sensor_door_outlined,
                            color: AppColors.primary,
                          ),
                        ),
                        const SizedBox(width: 14),
                        const Expanded(
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Text(
                                'Cửa chính',
                                style: TextStyle(fontWeight: FontWeight.bold),
                              ),
                              Text(
                                'Cảm biến cửa',
                                style: TextStyle(
                                  fontSize: 12,
                                  color: AppColors.textSecondary,
                                ),
                              ),
                            ],
                          ),
                        ),
                        Container(
                          padding: const EdgeInsets.symmetric(
                            horizontal: 10,
                            vertical: 6,
                          ),
                          decoration: BoxDecoration(
                            color: (_isDoorClosed ? Colors.green : Colors.orange)
                                .withValues(alpha: 0.12),
                            borderRadius: BorderRadius.circular(10),
                          ),
                          child: Text(
                            _isDoorClosed ? 'Đang đóng' : 'Đang mở',
                            style: TextStyle(
                              color: _isDoorClosed ? Colors.green : Colors.orange,
                              fontWeight: FontWeight.bold,
                              fontSize: 12,
                            ),
                          ),
                        ),
                      ],
                    ),
                    const Divider(height: 28, color: AppColors.track),
                    Row(
                      children: [
                        Container(
                          padding: const EdgeInsets.all(10),
                          decoration: BoxDecoration(
                            color: AppColors.surfaceTint,
                            borderRadius: BorderRadius.circular(14),
                          ),
                          child: const Icon(
                            Icons.lock_outline,
                            color: AppColors.primary,
                          ),
                        ),
                        const SizedBox(width: 14),
                        Expanded(
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              const Text(
                                'Khoá cửa',
                                style: TextStyle(fontWeight: FontWeight.bold),
                              ),
                              Text(
                                _isLocked ? 'Đã khoá' : 'Đang mở khoá',
                                style: const TextStyle(
                                  fontSize: 12,
                                  color: AppColors.textSecondary,
                                ),
                              ),
                            ],
                          ),
                        ),
                        Switch(
                          value: _isLocked,
                          onChanged: (value) =>
                              setState(() => _isLocked = value),
                        ),
                      ],
                    ),
                  ],
                ),
              ),
            ),
            const SizedBox(height: 16),
            FilledButton.icon(
              onPressed: () =>
                  setState(() => _isDoorClosed = !_isDoorClosed),
              icon: Icon(_isDoorClosed ? Icons.lock_open : Icons.lock),
              label: Text(_isDoorClosed ? 'Mở cửa từ xa' : 'Đóng cửa'),
            ),
            const SizedBox(height: 24),
            SettingsSection(
              title: 'HOẠT ĐỘNG GẦN ĐÂY',
              children: [
                SettingsTile(
                  icon: Icons.lock_open_outlined,
                  title: 'Mở khoá bởi Nguyễn Hoàng Đạt',
                  subtitle: 'Hôm nay, 08:12',
                  onTap: () => _showComingSoon('Lịch sử ra vào'),
                ),
                SettingsTile(
                  icon: Icons.lock_outlined,
                  title: 'Tự động khoá cửa',
                  subtitle: 'Hôm nay, 08:15',
                  onTap: () => _showComingSoon('Lịch sử ra vào'),
                ),
                SettingsTile(
                  icon: Icons.notifications_active_outlined,
                  title: 'Chuông cửa reo',
                  subtitle: 'Hôm qua, 19:40',
                  onTap: () => _showComingSoon('Lịch sử ra vào'),
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }
}

class _BlinkingDot extends StatefulWidget {
  const _BlinkingDot();

  @override
  State<_BlinkingDot> createState() => _BlinkingDotState();
}

class _BlinkingDotState extends State<_BlinkingDot>
    with SingleTickerProviderStateMixin {
  late final AnimationController _controller = AnimationController(
    vsync: this,
    duration: const Duration(seconds: 1),
  )..repeat(reverse: true);

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return FadeTransition(
      opacity: _controller.drive(CurveTween(curve: Curves.easeInOut)),
      child: Container(
        width: 8,
        height: 8,
        decoration: const BoxDecoration(
          color: Colors.redAccent,
          shape: BoxShape.circle,
        ),
      ),
    );
  }
}
