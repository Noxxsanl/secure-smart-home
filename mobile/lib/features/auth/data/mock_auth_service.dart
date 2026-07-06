import '../models/mock_user.dart';

class MockAuthService {
  static const MockUser admin = MockUser(
    email: 'admin@smarthome.local',
    password: 'admin123',
    role: 'admin',
  );

  static MockUser? login({
    required String email,
    required String password,
  }) {
    final normalizedEmail = email.trim().toLowerCase();

    if (normalizedEmail == admin.email && password == admin.password) {
      return admin;
    }

    return null;
  }
}
