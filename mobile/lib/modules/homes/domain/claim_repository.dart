import 'package:flutter/foundation.dart';

import 'home.dart';
import 'home_role.dart';

/// `201 { home, role: "OWNER" }`.
@immutable
class ClaimResult {
  const ClaimResult({required this.home, required this.role});

  final Home home;
  final HomeRole role;
}

abstract class ClaimRepository {
  /// `POST /claim { code }` — [code] is `XXXX-XXXX-XXXX`.
  Future<ClaimResult> claimWithCode(String code);

  /// `POST /claim { qr_payload }` — [payload] starts with `SH1:`.
  Future<ClaimResult> claimWithQr(String payload);
}
