import 'package:flutter/foundation.dart';

/// The signed-in account (contract §2.1 `MeUser`).
@immutable
class MeUser {
  const MeUser({
    required this.id,
    required this.role,
    required this.displayName,
    this.username,
    this.email,
    this.customerId,
    this.userTag,
  });

  final int id;

  /// `admin` | `operator` | `user`. Only `user` can use the mobile app.
  final String role;
  final String? username;
  final String? email;
  final String displayName;
  final int? customerId;

  /// Short handle shown to share with an operator, e.g. `dat#4821`.
  final String? userTag;

  /// Vietnamese given name is the last word: "Nguyễn Hoàng Đạt" → "Đạt".
  String get firstName {
    final parts = displayName.trim().split(RegExp(r'\s+'));
    return parts.isEmpty || parts.last.isEmpty ? displayName : parts.last;
  }

  /// Two-letter initials for avatars: "Nguyễn Hoàng Đạt" → "NĐ".
  String get initials {
    final parts = displayName
        .trim()
        .split(RegExp(r'\s+'))
        .where((part) => part.isNotEmpty)
        .toList();
    if (parts.isEmpty) return '?';
    if (parts.length == 1) {
      final word = parts.first;
      return word.substring(0, word.length >= 2 ? 2 : 1).toUpperCase();
    }
    return '${parts.first[0]}${parts.last[0]}'.toUpperCase();
  }

  MeUser copyWith({String? displayName}) => MeUser(
    id: id,
    role: role,
    displayName: displayName ?? this.displayName,
    username: username,
    email: email,
    customerId: customerId,
    userTag: userTag,
  );
}
