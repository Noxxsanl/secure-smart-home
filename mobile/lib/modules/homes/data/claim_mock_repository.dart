import '../../../mock/mock_backend.dart';
import '../domain/claim_repository.dart';

/// Mock activation (contract §8 codes): `7K2M-9QXA-4TPB` and `H3VD-8NRW-2CYE`
/// are valid, `B9FE-3WRA-7GMK` is expired and `Q4ZT-6MJK-1PSX` is used.
/// Five wrong attempts in 15 minutes → `RATE_LIMITED` (FR-3.6).
class MockClaimRepository implements ClaimRepository {
  MockClaimRepository(this._backend);

  final MockBackend _backend;

  @override
  Future<ClaimResult> claimWithCode(String code) =>
      _backend.respond(() => _backend.claim(code: code));

  @override
  Future<ClaimResult> claimWithQr(String payload) =>
      _backend.respond(() => _backend.claim(qrPayload: payload));
}
