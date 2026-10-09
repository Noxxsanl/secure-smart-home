import 'dart:async';

import 'package:flutter_test/flutter_test.dart';
import 'package:smart_home_mobile/core/network/api_exception.dart';
import 'package:smart_home_mobile/core/network/error_messages.dart';

void main() {
  // Every error code of contract §0, §2 and §4 plus client-side codes.
  const contractCodes = [
    'MISSING_FIELDS', 'INVALID_INPUT', 'NO_TOKEN', 'INVALID_TOKEN',
    'TOKEN_EXPIRED', 'FORBIDDEN', 'NOT_FOUND', 'TOO_MANY_REQUESTS', 'TIMEOUT',
    'INVALID_REFRESH_TOKEN', 'REFRESH_TOKEN_EXPIRED', 'REFRESH_TOKEN_REUSED',
    'INVALID_CREDENTIALS', 'ACCOUNT_LOCKED', 'USE_DASHBOARD', 'USE_MOBILE_APP',
    'WRONG_PORTAL', 'EMAIL_TAKEN', 'NOT_CONTROLLABLE', 'DEVICE_OFFLINE',
    'DEVICE_BLOCKED', 'HOME_SUSPENDED', 'RATE_LIMITED', 'ALREADY_USED',
    'EXPIRED', 'CANNOT_INVITE_SELF', 'ALREADY_MEMBER', 'OWNER_CANNOT_LEAVE',
    'ALREADY_RESPONDED', 'SERVER_ERROR', 'NETWORK_ERROR', 'CLIENT_TIMEOUT',
    'SESSION_EXPIRED', 'INVALID_QR', 'CONFLICT',
  ];

  test('every contract code maps to Vietnamese guidance, never the raw code', () {
    final unknown = messageForCode('UNKNOWN');
    for (final code in contractCodes) {
      final message = messageForCode(code);
      expect(message, isNotEmpty, reason: code);
      expect(message, isNot(unknown), reason: '$code has no specific message');
      expect(message.contains(code), isFalse, reason: '$code leaks to the user');
    }
  });

  test('unknown codes fall back to a generic Vietnamese message', () {
    expect(messageForCode('SOMETHING_NEW'), messageForCode('UNKNOWN'));
  });

  test('network failure uses the exact required text', () {
    const text =
        'Không kết nối được máy chủ. Kiểm tra mạng hoặc địa chỉ máy chủ.';
    expect(networkErrorMessage, text);
    expect(
      userMessageFor(const ApiException(code: ApiErrorCode.networkError)),
      text,
    );
  });

  test('staff accounts are told to use the Web Dashboard', () {
    final message = userMessageFor(
      const ApiException(code: ApiErrorCode.useDashboard, statusCode: 403),
      context: ErrorContext.login,
    );
    expect(message, contains('Web Dashboard'));
  });

  test('claim errors have claim-specific wording', () {
    for (final code in ['NOT_FOUND', 'ALREADY_USED', 'EXPIRED']) {
      expect(
        messageForCode(code, context: ErrorContext.claim),
        isNot(messageForCode(code)),
        reason: code,
      );
    }
    expect(
      messageForCode('NOT_FOUND', context: ErrorContext.claim),
      contains('mã kích hoạt'),
    );
  });

  test('RATE_LIMITED converts retry_after_seconds to minutes (rounded up)', () {
    expect(
      messageForCode('RATE_LIMITED', retryAfterSeconds: 600),
      contains('10 phút'),
    );
    expect(
      messageForCode('RATE_LIMITED', retryAfterSeconds: 61),
      contains('2 phút'),
    );
    expect(
      messageForCode('RATE_LIMITED', retryAfterSeconds: 5),
      contains('1 phút'),
    );
    expect(messageForCode('RATE_LIMITED'), contains('ít phút'));
  });

  test('transport errors map without leaking exception text', () {
    expect(
      userMessageFor(TimeoutException('x')),
      messageForCode(ApiErrorCode.clientTimeout),
    );
    expect(
      userMessageFor(const FormatException('bad json')),
      messageForCode(ApiErrorCode.invalidResponse),
    );
    expect(userMessageFor(StateError('boom')), messageForCode('UNKNOWN'));
  });

  test('ApiException.fromHttp reads error, retry_after_seconds, status fallback', () {
    final error = ApiException.fromHttp(429, {
      'error': 'RATE_LIMITED',
      'retry_after_seconds': 540,
    });
    expect(error.code, 'RATE_LIMITED');
    expect(error.retryAfterSeconds, 540);
    expect(ApiException.fromHttp(404, {'status': 404}).code, 'NOT_FOUND');
    expect(ApiException.fromHttp(503, null).code, 'SERVER_ERROR');
  });
}
