import '../../../core/network/api_client.dart';
import '../../../core/utils/json.dart';
import '../domain/home.dart';
import '../domain/home_repository.dart';
import '../domain/overview.dart';
import 'home_mapper.dart';

/// `/api/mobile/homes/**` (contract §4.2).
class RemoteHomeRepository implements HomeRepository {
  RemoteHomeRepository(this._api);

  final ApiClient _api;

  @override
  Future<List<MyHome>> listHomes() async {
    final data = await _api.get('/homes');
    return asJsonList(data).map(myHomeFromJson).toList();
  }

  @override
  Future<HomeOverview> overview(int homeId) async =>
      overviewFromJson(asJson(await _api.get('/homes/$homeId/overview')));

  @override
  Future<Home> updateHome(int homeId, {String? name, String? address}) async {
    final data = await _api.patch(
      '/homes/$homeId',
      body: {
        if (name != null) 'name': name.trim(),
        if (address != null) 'address': address.trim(),
      },
    );
    return homeFromJson(asJson(data));
  }
}
