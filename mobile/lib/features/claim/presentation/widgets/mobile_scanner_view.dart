import 'package:flutter/material.dart';
import 'package:mobile_scanner/mobile_scanner.dart';

import '../../../../core/theme/app_theme.dart';

/// Why the camera cannot be used; the claim screen falls back to manual entry.
enum QrScanFailure { permissionDenied, unsupported }

/// The default camera view for the claim screen (FR-3.1). It only reports raw
/// QR text; deciding whether it is a Smart Home code is the screen's job.
Widget buildMobileScannerView(
  BuildContext context,
  ValueChanged<String> onScanned,
  ValueChanged<QrScanFailure> onFailure,
) => _MobileScannerView(onScanned: onScanned, onFailure: onFailure);

class _MobileScannerView extends StatefulWidget {
  const _MobileScannerView({required this.onScanned, required this.onFailure});

  final ValueChanged<String> onScanned;
  final ValueChanged<QrScanFailure> onFailure;

  @override
  State<_MobileScannerView> createState() => _MobileScannerViewState();
}

class _MobileScannerViewState extends State<_MobileScannerView> {
  final MobileScannerController _controller = MobileScannerController(
    formats: const [BarcodeFormat.qrCode],
    detectionTimeoutMs: 800,
  );
  bool _failureReported = false;

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  void _onDetect(BarcodeCapture capture) {
    for (final barcode in capture.barcodes) {
      final value = barcode.rawValue;
      if (value != null && value.isNotEmpty) {
        widget.onScanned(value);
        return;
      }
    }
  }

  Widget _errorView(BuildContext context, MobileScannerException error) {
    if (!_failureReported) {
      _failureReported = true;
      final failure = error.errorCode == MobileScannerErrorCode.permissionDenied
          ? QrScanFailure.permissionDenied
          : QrScanFailure.unsupported;
      WidgetsBinding.instance.addPostFrameCallback((_) {
        if (mounted) widget.onFailure(failure);
      });
    }
    return const ColoredBox(
      color: Colors.black,
      child: Center(child: CircularProgressIndicator()),
    );
  }

  @override
  Widget build(BuildContext context) {
    return Stack(
      fit: StackFit.expand,
      children: [
        MobileScanner(
          controller: _controller,
          onDetect: _onDetect,
          errorBuilder: _errorView,
        ),
        IgnorePointer(
          child: Center(
            child: Container(
              width: 220,
              height: 220,
              decoration: BoxDecoration(
                borderRadius: BorderRadius.circular(24),
                border: Border.all(color: Colors.white, width: 3),
              ),
            ),
          ),
        ),
        Positioned(
          right: 12,
          bottom: 12,
          child: IconButton.filledTonal(
            tooltip: 'Bật/tắt đèn pin',
            style: IconButton.styleFrom(
              backgroundColor: Colors.black.withValues(alpha: 0.45),
              foregroundColor: Colors.white,
            ),
            onPressed: _controller.toggleTorch,
            icon: const Icon(Icons.flashlight_on_outlined),
          ),
        ),
        const Positioned(
          left: 0,
          right: 0,
          top: 12,
          child: Center(
            child: Text(
              'Đưa mã QR vào khung',
              style: TextStyle(
                color: Colors.white,
                fontWeight: FontWeight.w600,
                shadows: [Shadow(blurRadius: 6, color: AppColors.textPrimary)],
              ),
            ),
          ),
        ),
      ],
    );
  }
}
