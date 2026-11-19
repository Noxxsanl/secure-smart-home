import 'home.dart';
import 'overview.dart';

/// Home reads/writes under `/api/mobile/homes/**`.
abstract class HomeRepository {
  /// `GET /homes`.
  Future<List<MyHome>> listHomes();

  /// `GET /homes/:homeId/overview`.
  Future<HomeOverview> overview(int homeId);

  /// `PATCH /homes/:homeId { name?, address? }` (OWNER/CONTROLLER).
  Future<Home> updateHome(int homeId, {String? name, String? address});
}
