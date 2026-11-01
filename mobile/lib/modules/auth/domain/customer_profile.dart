import 'package:flutter/foundation.dart';

/// `GET /me/profile` (contract §4.2).
@immutable
class CustomerProfile {
  const CustomerProfile({
    required this.fullName,
    this.customerId,
    this.userId,
    this.email,
    this.phone,
    this.address,
    this.userTag,
    this.joinedAt,
  });

  final int? customerId;
  final int? userId;
  final String fullName;
  final String? email;
  final String? phone;
  final String? address;
  final String? userTag;
  final DateTime? joinedAt;
}
