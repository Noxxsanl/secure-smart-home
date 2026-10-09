import '../../../core/network/api_client.dart';
import '../../../core/utils/json.dart';
import '../../homes/data/home_mapper.dart';
import '../../homes/domain/home_role.dart';
import '../domain/claim_repository.dart';

/// `POST /api/mobile/claim` (contract §4.2, FR-3.x).
class RemoteClaimRepository implements ClaimRepository {
  RemoteClaimRepository(this._api);

  final ApiClient _api;

  @override
  Future<ClaimResult> claimWithCode(String code) =>
      _claim({'code': code.trim()});

  @override
  Future<ClaimResult> claimWithQr(String payload) =>
      _claim({'qr_payload': payload.trim()});

  Future<ClaimResult> _claim(Map<String, Object?> body) async {
    final json = asJson(await _api.post('/claim', body: body));
    return ClaimResult(
      home: homeFromJson(json.readObject('home')),
      role: HomeRole.fromApi(json.readStringOrNull('role') ?? 'OWNER'),
    );
  }
}
