import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../../core/network/error_messages.dart';
import '../../../../core/theme/app_theme.dart';
import '../../../../core/widgets/app_widgets.dart';
import '../../../../core/widgets/async_views.dart';
import '../../application/device_providers.dart';
import '../../domain/camera_snapshot.dart';

/// "Ảnh camera": newest picture (4:3) with capture time and trigger, a strip
/// of up to [cameraSnapshotLimit] recent pictures, tap to enlarge. Reloaded by
/// pull-to-refresh on the page and by the `camera_snapshot` realtime event
/// (both invalidate [cameraSnapshotsProvider]).
class CameraSnapshotsSection extends ConsumerStatefulWidget {
  const CameraSnapshotsSection({super.key, required this.deviceId});

  final int deviceId;

  @override
  ConsumerState<CameraSnapshotsSection> createState() =>
      _CameraSnapshotsSectionState();
}

class _CameraSnapshotsSectionState
    extends ConsumerState<CameraSnapshotsSection> {
  /// null = follow the newest picture.
  int? _selectedId;

  @override
  Widget build(BuildContext context) {
    final snapshots = ref.watch(cameraSnapshotsProvider(widget.deviceId));
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        const SectionHeader('Ảnh camera'),
        snapshots.when(
          loading: () => const AspectRatio(
            aspectRatio: 4 / 3,
            child: Center(child: CircularProgressIndicator()),
          ),
          error: (error, _) => AppCard(
            child: ErrorView(
              message: userMessageFor(error),
              onRetry: () =>
                  ref.invalidate(cameraSnapshotsProvider(widget.deviceId)),
            ),
          ),
          data: _buildLoaded,
        ),
      ],
    );
  }

  Widget _buildLoaded(List<CameraSnapshot> items) {
    if (items.isEmpty) {
      return const AppCard(
        child: Column(
          children: [
            Icon(
              Icons.photo_camera_outlined,
              size: 40,
              color: AppColors.textSecondary,
            ),
            SizedBox(height: 10),
            Text(
              'Chưa có ảnh nào. Camera sẽ gửi ảnh khi phát hiện chuyển động.',
              textAlign: TextAlign.center,
              style: TextStyle(color: AppColors.textSecondary),
            ),
          ],
        ),
      );
    }
    final shown = items.take(cameraSnapshotLimit).toList();
    final selected = shown.firstWhere(
      (item) => item.id == _selectedId,
      orElse: () => shown.first,
    );
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        GestureDetector(
          key: const ValueKey<String>('camera-main-image'),
          onTap: () => _openLarge(selected),
          child: ClipRRect(
            borderRadius: BorderRadius.circular(20),
            child: AspectRatio(
              aspectRatio: 4 / 3,
              child: SnapshotImage(snapshotId: selected.id),
            ),
          ),
        ),
        const SizedBox(height: 10),
        Row(
          children: [
            Expanded(
              child: Text(
                formatSnapshotTime(selected.capturedAt),
                style: const TextStyle(
                  fontWeight: FontWeight.w600,
                  color: AppColors.textPrimary,
                ),
              ),
            ),
            StatusPill(
              selected.trigger.label,
              color: selected.trigger == SnapshotTrigger.motion
                  ? AppColors.warning
                  : AppColors.primary,
            ),
          ],
        ),
        if (shown.length > 1) ...[
          const SizedBox(height: 12),
          SizedBox(
            height: 64,
            child: ListView.separated(
              scrollDirection: Axis.horizontal,
              itemCount: shown.length,
              separatorBuilder: (_, _) => const SizedBox(width: 8),
              itemBuilder: (context, index) {
                final item = shown[index];
                final isSelected = item.id == selected.id;
                return GestureDetector(
                  key: ValueKey<String>('camera-thumb-${item.id}'),
                  onTap: () => setState(() => _selectedId = item.id),
                  child: Container(
                    width: 84,
                    decoration: BoxDecoration(
                      borderRadius: BorderRadius.circular(10),
                      border: Border.all(
                        color: isSelected
                            ? AppColors.primary
                            : Colors.transparent,
                        width: 2,
                      ),
                    ),
                    child: ClipRRect(
                      borderRadius: BorderRadius.circular(8),
                      child: SnapshotImage(
                        snapshotId: item.id,
                        thumbnail: true,
                      ),
                    ),
                  ),
                );
              },
            ),
          ),
        ],
      ],
    );
  }

  void _openLarge(CameraSnapshot snapshot) {
    showDialog<void>(
      context: context,
      builder: (context) => Dialog.fullscreen(
        backgroundColor: Colors.black,
        child: Stack(
          children: [
            Positioned.fill(
              child: InteractiveViewer(
                maxScale: 5,
                child: Center(
                  child: SnapshotImage(
                    snapshotId: snapshot.id,
                    fit: BoxFit.contain,
                  ),
                ),
              ),
            ),
            Positioned(
              left: 16,
              right: 64,
              bottom: 24,
              child: Text(
                '${formatSnapshotTime(snapshot.capturedAt)} · ${snapshot.trigger.label}',
                style: const TextStyle(color: Colors.white),
              ),
            ),
            Positioned(
              top: 12,
              right: 12,
              child: SafeArea(
                child: IconButton(
                  tooltip: 'Đóng',
                  icon: const Icon(Icons.close, color: Colors.white),
                  onPressed: () => Navigator.of(context).pop(),
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

/// One camera JPEG. Bytes come from [snapshotImageProvider] (Bearer token and
/// one refresh-and-retry on 401 are handled by the API client, so no token is
/// ever put in a URL or kept by the widget).
class SnapshotImage extends ConsumerWidget {
  const SnapshotImage({
    super.key,
    required this.snapshotId,
    this.thumbnail = false,
    this.fit = BoxFit.cover,
  });

  final int snapshotId;
  final bool thumbnail;
  final BoxFit fit;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final bytes = ref.watch(snapshotImageProvider(snapshotId));
    return bytes.when(
      loading: () => const ColoredBox(
        color: AppColors.surfaceTint,
        child: Center(child: CircularProgressIndicator(strokeWidth: 2)),
      ),
      error: (error, _) => _failed(
        message: userMessageFor(error),
        onRetry: () => ref.invalidate(snapshotImageProvider(snapshotId)),
      ),
      data: (data) => Image.memory(
        data,
        fit: fit,
        cacheWidth: thumbnail ? 200 : null,
        gaplessPlayback: true,
        errorBuilder: (_, _, _) => _failed(
          message: 'Không hiển thị được ảnh này.',
          onRetry: () => ref.invalidate(snapshotImageProvider(snapshotId)),
        ),
      ),
    );
  }

  Widget _failed({required String message, required VoidCallback onRetry}) {
    return InkWell(
      onTap: onRetry,
      child: ColoredBox(
        color: AppColors.surfaceTint,
        child: Center(
          child: thumbnail
              ? const Icon(
                  Icons.broken_image_outlined,
                  color: AppColors.textSecondary,
                )
              : Padding(
                  padding: const EdgeInsets.all(16),
                  child: Text(
                    '$message Chạm để thử lại.',
                    textAlign: TextAlign.center,
                    style: const TextStyle(color: AppColors.textSecondary),
                  ),
                ),
        ),
      ),
    );
  }
}
