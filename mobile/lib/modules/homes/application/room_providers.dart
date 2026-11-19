import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/config/app_config.dart';
import '../../../core/network/network_providers.dart';
import '../../../mock/mock_providers.dart';
import '../data/room_mock_repository.dart';
import '../data/room_remote_repository.dart';
import '../domain/room_repository.dart';

final roomRepositoryProvider = Provider<RoomRepository>((ref) {
  final config = ref.watch(appConfigProvider);
  if (config.useMock) {
    return MockRoomRepository(ref.watch(mockBackendProvider));
  }
  return RemoteRoomRepository(ref.watch(apiClientProvider));
});
