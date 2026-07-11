import '../models/mock_user.dart';

class MockAuthService {
  static const MockUser admin = MockUser(
    name: 'Nguyễn Hoàng Đạt',
    email: 'admin@smarthome.local',
    phone: '0912 345 678',
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
