import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../../core/config/app_config.dart';
import '../../../../core/network/api_exception.dart';
import '../../../../core/network/network_providers.dart';
import '../../../../mock/mock_providers.dart';
import '../../../auth/presentation/providers/auth_providers.dart';
import '../../data/profile_mock_repository.dart';
import '../../data/profile_remote_repository.dart';
import '../../domain/customer_profile.dart';
import '../../domain/profile_repository.dart';

final profileRepositoryProvider = Provider<ProfileRepository>((ref) {
  final config = ref.watch(appConfigProvider);
  if (config.useMock) {
    return MockProfileRepository(ref.watch(mockBackendProvider));
  }
  return RemoteProfileRepository(ref.watch(apiClientProvider));
});

class ProfileNotifier extends AsyncNotifier<CustomerProfile> {
  @override
  Future<CustomerProfile> build() {
    final userId = ref.watch(sessionUserIdProvider);
    final repository = ref.watch(profileRepositoryProvider);
    if (userId == null) {
      return Future<CustomerProfile>.error(
        const ApiException(code: ApiErrorCode.sessionExpired),
      );
    }
    return repository.getProfile();
  }

  /// Saves the edited fields and mirrors the new name into the session.
  Future<void> save({
    required String fullName,
    required String phone,
    required String address,
  }) async {
    final profile = await ref
        .read(profileRepositoryProvider)
        .updateProfile(fullName: fullName, phone: phone, address: address);
    if (!ref.mounted) return;
    state = AsyncData(profile);
    ref
        .read(authControllerProvider.notifier)
        .updateDisplayName(profile.fullName);
  }
}

final profileProvider = AsyncNotifierProvider<ProfileNotifier, CustomerProfile>(
  ProfileNotifier.new,
);
