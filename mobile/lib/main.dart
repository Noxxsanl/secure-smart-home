import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'app/app.dart';

export 'app/app.dart';

void main() {
  runApp(
    // No automatic provider retries: failures are shown with a retry button.
    ProviderScope(retry: (_, _) => null, child: const SmartHomeApp()),
  );
}
