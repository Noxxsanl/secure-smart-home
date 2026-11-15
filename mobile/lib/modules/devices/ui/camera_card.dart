import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/theme/app_theme.dart';
import '../../../core/widgets/app_widgets.dart';
import '../application/device_providers.dart';
import '../domain/camera_snapshot.dart';
import '../domain/device.dart';

/// Camera tile of the Home screen (web `HomeCameraCard`): newest picture 4:3,
/// name, online state and "Xem trực tiếp". Tapping the tile opens the camera
/// page; the button opens it and starts the stream ([onWatchLive]).
class CameraCard extends ConsumerWidget {
  const CameraCard({
    super.key,
    required this.device,
    required this.onOpen,
    required this.onWatchLive,
  });

  final CustomerDevice device;
  final VoidCallback onOpen;
  final VoidCallback onWatchLive;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final snapshots = ref.watch(cameraSnapshotsProvider(device.id)).value;
    final latest = (snapshots == null || snapshots.isEmpty)
        ? null
        : ([...snapshots]..sort(CameraSnapshot.newestFirst)).first;

    return Material(
      color: AppColors.surface,
      borderRadius: BorderRadius.circular(24),
      clipBehavior: Clip.antiAlias,
      child: InkWell(
        key: ValueKey<String>('camera-card-${device.id}'),
        onTap: onOpen,
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            AspectRatio(
              aspectRatio: 4 / 3,
              child: latest == null
                  ? const _NoPicture()
                  : _Picture(snapshotId: latest.id),
            ),
            Padding(
              padding: const EdgeInsets.fromLTRB(16, 12, 16, 14),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    children: [
                      Expanded(
                        child: Text(
                          device.name,
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          style: const TextStyle(
                            fontWeight: FontWeight.bold,
                            fontSize: 15,
                          ),
                        ),
                      ),
                      StatusPill(
                        device.online ? 'Online' : 'Ngoại tuyến',
                        color: device.online
                            ? AppColors.success
                            : AppColors.offline,
                      ),
                    ],
                  ),
                  if (latest != null) ...[
                    const SizedBox(height: 2),
                    Text(
                      'Ảnh lúc ${formatSnapshotTime(latest.capturedAt)}',
                      style: const TextStyle(
                        fontSize: 12,
                        color: AppColors.textSecondary,
                      ),
                    ),
                  ],
                  const SizedBox(height: 10),
                  SizedBox(
                    width: double.infinity,
                    child: FilledButton.icon(
                      key: ValueKey<String>('camera-watch-${device.id}'),
                      onPressed: onWatchLive,
                      icon: const Icon(Icons.play_arrow_rounded),
                      label: const Text('Xem trực tiếp'),
                    ),
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _NoPicture extends StatelessWidget {
  const _NoPicture();

  @override
  Widget build(BuildContext context) {
    return const ColoredBox(
      color: AppColors.surfaceTint,
      child: Center(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(
              Icons.image_not_supported_outlined,
              color: AppColors.textSecondary,
            ),
            SizedBox(height: 6),
            Text(
              'Chưa có ảnh',
              style: TextStyle(color: AppColors.textSecondary),
            ),
          ],
        ),
      ),
    );
  }
}

class _Picture extends ConsumerWidget {
  const _Picture({required this.snapshotId});

  final int snapshotId;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final bytes = ref.watch(snapshotImageProvider(snapshotId));
    return bytes.when(
      loading: () => const ColoredBox(
        color: AppColors.surfaceTint,
        child: Center(child: CircularProgressIndicator(strokeWidth: 2)),
      ),
      error: (_, _) => const _NoPicture(),
      data: (data) => Image.memory(
        data,
        fit: BoxFit.cover,
        gaplessPlayback: true,
        errorBuilder: (_, _, _) => const _NoPicture(),
      ),
    );
  }
}
