import '../../../mock/mock_backend.dart';
import '../domain/home.dart';
import '../domain/home_repository.dart';
import '../domain/overview.dart';

class MockHomeRepository implements HomeRepository {
  MockHomeRepository(this._backend);

  final MockBackend _backend;

  @override
  Future<List<MyHome>> listHomes() => _backend.respond(_backend.myHomes);

  @override
  Future<HomeOverview> overview(int homeId) =>
      _backend.respond(() => _backend.overviewFor(homeId));

  @override
  Future<Home> updateHome(int homeId, {String? name, String? address}) {
    return _backend.respond(() {
      final membership = _backend.requireMembership(homeId);
      if (!membership.role.canRename) _backend.forbidden();
      final newName = name?.trim();
      if (newName != null && (newName.isEmpty || newName.length > 128)) {
        _backend.invalidInput();
      }
      final record = _backend.homeRecord(homeId);
      record.home = record.home.copyWith(name: newName, address: address);
      _backend.emitHomeChanged(homeId);
      return record.home;
    });
  }
}
