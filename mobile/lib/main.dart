import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'app/app.dart';
import 'core/config/trusted_ca.dart';

export 'app/app.dart';

void main() {
  // HTTPS tới máy chủ dùng CA nội bộ (API_BASE_URL=https://<IP>, API_CA_PEM_BASE64)
  installTrustedCa();
  runApp(
    // No automatic provider retries: failures are shown with a retry button.
    ProviderScope(retry: (_, _) => null, child: const SmartHomeApp()),
  );
}
