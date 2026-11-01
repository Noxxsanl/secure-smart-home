import '../../../core/network/api_client.dart';
import '../../../core/utils/json.dart';
import '../../devices/devices.dart';
import '../domain/home_role.dart';
import '../domain/room.dart';
import '../domain/room_repository.dart';
import 'home_mapper.dart';
import 'room_mapper.dart';

/// `/api/mobile/rooms/**` (contract §4.2).
class RemoteRoomRepository implements RoomRepository {
  RemoteRoomRepository(this._api);

  final ApiClient _api;

  @override
  Future<RoomDetail> getRoom(int roomId) async {
    final json = asJson(await _api.get('/rooms/$roomId'));
    return RoomDetail(
      room: roomFromJson(json.readObject('room')),
      home: homeFromJson(json.readObject('home')),
      role: HomeRole.fromApi(json.readStringOrNull('role')),
      devices: json.readObjectList('devices').map(deviceFromJson).toList(),
    );
  }

  @override
  Future<RoomSummary> renameRoom(int roomId, String name) async {
    final data = await _api.patch('/rooms/$roomId', body: {'name': name.trim()});
    return roomFromJson(asJson(data));
  }
}
