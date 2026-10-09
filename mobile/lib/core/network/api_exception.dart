/// Error codes returned by the backend (contract §0, §2, §4) plus a few
/// client-side codes. UI never shows these raw — see `error_messages.dart`.
abstract final class ApiErrorCode {
  // Validation / auth (contract §0, §2)
  static const missingFields = 'MISSING_FIELDS';
  static const invalidInput = 'INVALID_INPUT';
  static const noToken = 'NO_TOKEN';
  static const invalidToken = 'INVALID_TOKEN';
  static const tokenExpired = 'TOKEN_EXPIRED';
  static const invalidRefreshToken = 'INVALID_REFRESH_TOKEN';
  static const refreshTokenExpired = 'REFRESH_TOKEN_EXPIRED';
  static const refreshTokenReused = 'REFRESH_TOKEN_REUSED';
  static const invalidCredentials = 'INVALID_CREDENTIALS';
  static const accountLocked = 'ACCOUNT_LOCKED';
  static const useDashboard = 'USE_DASHBOARD';
  static const useMobileApp = 'USE_MOBILE_APP';
  static const wrongPortal = 'WRONG_PORTAL';
  static const csrfCheckFailed = 'CSRF_CHECK_FAILED';
  static const emailTaken = 'EMAIL_TAKEN';
  static const forbidden = 'FORBIDDEN';
  static const notFound = 'NOT_FOUND';
  static const tooManyRequests = 'TOO_MANY_REQUESTS';

  // Devices (contract §4.2)
  static const notControllable = 'NOT_CONTROLLABLE';
  static const deviceOffline = 'DEVICE_OFFLINE';
  static const deviceBlocked = 'DEVICE_BLOCKED';
  static const homeSuspended = 'HOME_SUSPENDED';
  static const timeout = 'TIMEOUT';

  // Claim (FR-3.5)
  static const rateLimited = 'RATE_LIMITED';
  static const alreadyUsed = 'ALREADY_USED';
  static const expired = 'EXPIRED';

  // Members & automation
  static const cannotInviteSelf = 'CANNOT_INVITE_SELF';
  static const alreadyMember = 'ALREADY_MEMBER';
  static const ownerCannotLeave = 'OWNER_CANNOT_LEAVE';
  static const alreadyResponded = 'ALREADY_RESPONDED';

  // Staff-only codes (never expected on /api/mobile, mapped for completeness)
  static const accessGrantRequired = 'ACCESS_GRANT_REQUIRED';
  static const alreadyClaimed = 'ALREADY_CLAIMED';
  static const customerNotFound = 'CUSTOMER_NOT_FOUND';
  static const usernameTaken = 'USERNAME_TAKEN';
  static const versionExists = 'VERSION_EXISTS';
  static const noTargets = 'NO_TARGETS';
  static const notSimulated = 'NOT_SIMULATED';

  // Status-only fallbacks and client-side codes
  static const conflict = 'CONFLICT';
  static const serverError = 'SERVER_ERROR';
  static const networkError = 'NETWORK_ERROR';
  static const clientTimeout = 'CLIENT_TIMEOUT';
  static const invalidResponse = 'INVALID_RESPONSE';
  static const sessionExpired = 'SESSION_EXPIRED';
  static const invalidQr = 'INVALID_QR';
  static const unknown = 'UNKNOWN';

  /// 401 codes that mean "the access token is missing/bad/expired" — the only
  /// ones that should trigger a refresh. Other 401s (e.g. a wrong current
  /// password on `POST /me/password`) are business errors.
  static const tokenRejections = {noToken, invalidToken, tokenExpired};
}

/// A failed API call. [code] is the backend `error` field (or a client-side
/// code); [detail] is developer text and must never be shown to users.
class ApiException implements Exception {
  const ApiException({
    required this.code,
    this.statusCode,
    this.detail,
    this.retryAfterSeconds,
    this.role,
  });

  /// Builds an exception from an HTTP error response.
  factory ApiException.fromHttp(
    int statusCode,
    Object? body, {
    String? retryAfterHeader,
  }) {
    String? code;
    String? detail;
    int? retryAfter;
    String? role;
    if (body is Map) {
      final error = body['error'];
      if (error is String && error.trim().isNotEmpty) code = error.trim();
      final detailValue = body['detail'];
      if (detailValue is String) detail = detailValue;
      final retryValue = body['retry_after_seconds'];
      if (retryValue is num) {
        retryAfter = retryValue.ceil();
      } else if (retryValue is String) {
        retryAfter = int.tryParse(retryValue);
      }
      final roleValue = body['role'];
      if (roleValue is String) role = roleValue;
    }
    retryAfter ??= int.tryParse(retryAfterHeader?.trim() ?? '');
    return ApiException(
      code: code ?? codeForStatus(statusCode),
      statusCode: statusCode,
      detail: detail,
      retryAfterSeconds: retryAfter,
      role: role,
    );
  }

  final String code;
  final int? statusCode;
  final String? detail;
  final int? retryAfterSeconds;
  final String? role;

  bool get isNetwork =>
      code == ApiErrorCode.networkError || code == ApiErrorCode.clientTimeout;

  /// Fallback when the body has no `error` field (e.g. Express default
  /// 404/500 handlers return `{ status, message }`).
  static String codeForStatus(int statusCode) {
    if (statusCode >= 500) return ApiErrorCode.serverError;
    return switch (statusCode) {
      400 => ApiErrorCode.invalidInput,
      401 => ApiErrorCode.invalidToken,
      403 => ApiErrorCode.forbidden,
      404 => ApiErrorCode.notFound,
      409 => ApiErrorCode.conflict,
      410 => ApiErrorCode.expired,
      429 => ApiErrorCode.tooManyRequests,
      _ => ApiErrorCode.unknown,
    };
  }

  @override
  String toString() => 'ApiException(${statusCode ?? '-'} $code)';
}
