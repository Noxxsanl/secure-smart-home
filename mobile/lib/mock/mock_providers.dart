import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'mock_backend.dart';

/// The single in-memory backend shared by every mock repository. Only read
/// when `AppConfig.useMock` is true (or overridden in tests).
final mockBackendProvider = Provider<MockBackend>(
  (ref) => MockBackend(latency: const Duration(milliseconds: 350)),
);
