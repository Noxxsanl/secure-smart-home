import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/config/app_config.dart';
import '../../../core/network/network_providers.dart';
import '../../../mock/mock_providers.dart';
import '../data/claim_mock_repository.dart';
import '../data/claim_remote_repository.dart';
import '../domain/claim_repository.dart';

final claimRepositoryProvider = Provider<ClaimRepository>((ref) {
  final config = ref.watch(appConfigProvider);
  if (config.useMock) {
    return MockClaimRepository(ref.watch(mockBackendProvider));
  }
  return RemoteClaimRepository(ref.watch(apiClientProvider));
});
