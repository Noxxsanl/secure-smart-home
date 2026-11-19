import 'dart:async';

import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../../core/network/api_exception.dart';
import '../../../../core/network/error_messages.dart';
import '../../../../core/theme/app_theme.dart';
import '../../../../core/widgets/app_widgets.dart';
import '../../application/claim_providers.dart';
import '../../application/homes_providers.dart';
import '../../domain/claim_code.dart';
import '../../domain/claim_repository.dart';
import '../../domain/home.dart';
import 'activation_code_formatter.dart';
import 'mobile_scanner_view.dart';

/// Claim a Smart Home (FR-3.1, 3.2, 3.5): QR scanner by default, manual code
/// entry as the fallback (or when the camera is unavailable/denied).
class ClaimPage extends ConsumerStatefulWidget {
  const ClaimPage({super.key});

  @override
  ConsumerState<ClaimPage> createState() => _ClaimPageState();
}

class _ClaimPageState extends ConsumerState<ClaimPage> {
  final _formKey = GlobalKey<FormState>();
  final _codeController = TextEditingController();

  late bool _manual;
  late final bool _cameraSupported;
  bool _cameraBroken = false;
  bool _busy = false;
  String? _error;
  String? _cameraNote;
  ClaimResult? _result;
  String? _lastPayload;
  DateTime? _lastScanAt;

  @override
  void initState() {
    super.initState();
    _cameraSupported =
        !kIsWeb &&
        (defaultTargetPlatform == TargetPlatform.android ||
            defaultTargetPlatform == TargetPlatform.iOS);
    _manual = !_cameraSupported;
    if (!_cameraSupported) {
      _cameraNote =
          'Thiết bị này không hỗ trợ quét mã QR. Hãy nhập mã kích hoạt in trên hộp sản phẩm.';
    }
  }

  @override
  void dispose() {
    _codeController.dispose();
    super.dispose();
  }

  Future<void> _submit(
    Future<ClaimResult> Function(ClaimRepository repository) call,
  ) async {
    if (_busy) return;
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      final result = await call(ref.read(claimRepositoryProvider));
      final homes = ref.read(homesProvider.notifier);
      // Select the new home right away, then fetch its counters.
      homes.addOrReplace(MyHome(home: result.home, role: result.role));
      unawaited(homes.refresh());
      if (!mounted) return;
      setState(() {
        _result = result;
        _busy = false;
      });
    } on Object catch (error) {
      if (!mounted) return;
      setState(() {
        _error = userMessageFor(error, context: ErrorContext.claim);
        _busy = false;
      });
    }
  }

  void _onScanned(String raw) {
    if (_busy || _result != null) return;
    final now = DateTime.now();
    if (raw == _lastPayload &&
        _lastScanAt != null &&
        now.difference(_lastScanAt!) < const Duration(seconds: 3)) {
      return;
    }
    _lastPayload = raw;
    _lastScanAt = now;
    if (!isSmartHomeQr(raw)) {
      setState(() => _error = messageForCode(ApiErrorCode.invalidQr));
      return;
    }
    unawaited(_submit((repository) => repository.claimWithQr(raw.trim())));
  }

  void _onCameraFailure(QrScanFailure failure) {
    if (!mounted) return;
    setState(() {
      _manual = true;
      _cameraBroken = true;
      _error = null;
      _cameraNote = failure == QrScanFailure.permissionDenied
          ? 'Ứng dụng chưa được cấp quyền dùng camera nên chưa quét được mã QR. '
                'Bạn có thể bật quyền camera trong Cài đặt của điện thoại, '
                'hoặc nhập mã kích hoạt thủ công bên dưới.'
          : 'Không mở được camera trên thiết bị này. Hãy nhập mã kích hoạt thủ công bên dưới.';
    });
  }

  void _submitManual() {
    if (!(_formKey.currentState?.validate() ?? false)) return;
    FocusScope.of(context).unfocus();
    final code = formatActivationCode(_codeController.text);
    unawaited(_submit((repository) => repository.claimWithCode(code)));
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Thêm Smart Home')),
      body: SafeArea(
        child: _result != null
            ? _SuccessView(result: _result!)
            : (_manual ? _buildManual() : _buildScanner()),
      ),
    );
  }

  Widget _buildScanner() {
    final scannerBuilder = ref.watch(qrScannerBuilderProvider);
    return Padding(
      padding: const EdgeInsets.fromLTRB(20, 4, 20, 20),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          const Text(
            'Quét mã QR in trên hộp sản phẩm để nhận quyền chủ nhà.',
            style: TextStyle(height: 1.4),
          ),
          const SizedBox(height: 16),
          Expanded(
            child: ClipRRect(
              borderRadius: BorderRadius.circular(24),
              child: ColoredBox(
                color: Colors.black,
                child: scannerBuilder(context, _onScanned, _onCameraFailure),
              ),
            ),
          ),
          if (_busy) ...[
            const SizedBox(height: 14),
            const LinearProgressIndicator(),
          ],
          if (_error != null) ...[
            const SizedBox(height: 14),
            InlineBanner(message: _error!, kind: BannerKind.error),
          ],
          const SizedBox(height: 12),
          OutlinedButton.icon(
            onPressed: _busy
                ? null
                : () => setState(() {
                    _manual = true;
                    _error = null;
                  }),
            icon: const Icon(Icons.keyboard_alt_outlined),
            label: const Text('Nhập mã thủ công'),
          ),
        ],
      ),
    );
  }

  Widget _buildManual() {
    return SingleChildScrollView(
      padding: const EdgeInsets.fromLTRB(20, 4, 20, 24),
      child: Form(
        key: _formKey,
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            const Text(
              'Nhập mã kích hoạt gồm 12 ký tự in trên hộp sản phẩm. '
              'Không phân biệt chữ hoa/thường, dấu gạch sẽ tự thêm.',
              style: TextStyle(height: 1.4),
            ),
            if (_cameraNote != null) ...[
              const SizedBox(height: 14),
              InlineBanner(
                message: _cameraNote!,
                kind: _cameraBroken ? BannerKind.warning : BannerKind.info,
              ),
            ],
            const SizedBox(height: 20),
            TextFormField(
              key: const ValueKey<String>('activation-code-field'),
              controller: _codeController,
              enabled: !_busy,
              autocorrect: false,
              enableSuggestions: false,
              textCapitalization: TextCapitalization.characters,
              textInputAction: TextInputAction.done,
              keyboardType: TextInputType.visiblePassword,
              inputFormatters: const [ActivationCodeInputFormatter()],
              onFieldSubmitted: (_) => _submitManual(),
              style: const TextStyle(
                fontSize: 22,
                fontWeight: FontWeight.bold,
                letterSpacing: 2,
              ),
              textAlign: TextAlign.center,
              decoration: const InputDecoration(
                labelText: 'Mã kích hoạt',
                hintText: 'XXXX-XXXX-XXXX',
              ),
              validator: (value) {
                if (value == null || value.trim().isEmpty) {
                  return 'Vui lòng nhập mã kích hoạt';
                }
                if (!isValidActivationCode(value)) {
                  return 'Mã gồm 12 ký tự dạng XXXX-XXXX-XXXX. Kiểm tra lại rồi thử lại';
                }
                return null;
              },
            ),
            if (_error != null) ...[
              const SizedBox(height: 16),
              InlineBanner(message: _error!, kind: BannerKind.error),
            ],
            const SizedBox(height: 22),
            FilledButton(
              onPressed: _busy ? null : _submitManual,
              child: _busy
                  ? const SizedBox(
                      width: 20,
                      height: 20,
                      child: CircularProgressIndicator(
                        strokeWidth: 2.5,
                        color: Colors.white,
                      ),
                    )
                  : const Text('XÁC NHẬN'),
            ),
            if (_cameraSupported && !_cameraBroken) ...[
              const SizedBox(height: 8),
              TextButton.icon(
                onPressed: _busy
                    ? null
                    : () => setState(() {
                        _manual = false;
                        _error = null;
                      }),
                icon: const Icon(Icons.qr_code_scanner),
                label: const Text('Quét mã QR'),
              ),
            ],
          ],
        ),
      ),
    );
  }
}

class _SuccessView extends StatelessWidget {
  const _SuccessView({required this.result});

  final ClaimResult result;

  @override
  Widget build(BuildContext context) {
    return SingleChildScrollView(
      padding: const EdgeInsets.fromLTRB(24, 24, 24, 24),
      child: Column(
        children: [
          Container(
            padding: const EdgeInsets.all(22),
            decoration: BoxDecoration(
              color: AppColors.success.withValues(alpha: 0.12),
              shape: BoxShape.circle,
            ),
            child: const Icon(
              Icons.check_circle_outline,
              size: 64,
              color: AppColors.success,
            ),
          ),
          const SizedBox(height: 20),
          const Text(
            'Bạn là chủ nhà',
            style: TextStyle(fontSize: 24, fontWeight: FontWeight.bold),
          ),
          const SizedBox(height: 8),
          Text(
            result.home.name,
            textAlign: TextAlign.center,
            style: const TextStyle(
              fontSize: 16,
              fontWeight: FontWeight.w600,
              color: AppColors.textPrimary,
            ),
          ),
          const SizedBox(height: 4),
          StatusPill(result.role.label, color: AppColors.primary),
          const SizedBox(height: 24),
          const InlineBanner(
            message:
                'Việc cài đặt WiFi cho Gateway sẽ có trong bản cập nhật sau. '
                'Hiện tại đơn vị lắp đặt sẽ cấu hình mạng giúp bạn.',
          ),
          const SizedBox(height: 28),
          FilledButton(
            onPressed: () =>
                Navigator.of(context).popUntil((route) => route.isFirst),
            child: const Text('Vào nhà của tôi'),
          ),
        ],
      ),
    );
  }
}
