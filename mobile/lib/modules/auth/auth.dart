/// Public API of the auth module (session, signed-in user, customer profile)
/// for other modules. Pages: auth_module.dart (only lib/app/ imports it).
library;

export 'application/auth_providers.dart';
export 'application/profile_providers.dart';
export 'domain/auth_repository.dart';
export 'domain/auth_user.dart';
export 'domain/customer_profile.dart';
export 'domain/profile_repository.dart';
