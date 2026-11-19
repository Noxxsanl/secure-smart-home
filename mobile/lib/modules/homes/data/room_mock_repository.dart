import '../../../mock/mock_backend.dart';
import '../domain/room.dart';
import '../domain/room_repository.dart';

class MockRoomRepository implements RoomRepository {
  MockRoomRepository(this._backend);

  final MockBackend _backend;

  @override
  Future<RoomDetail> getRoom(int roomId) {
    return _backend.respond(() {
      final base = _backend.requireRoom(roomId);
      final membership = _backend.requireMembership(base.homeId);
      return RoomDetail(
        room: _backend.roomView(base, membership),
        home: _backend.homeRecord(base.homeId).home,
        role: membership.role,
        devices: _backend
            .visibleDevices(base.homeId, membership)
            .where((d) => d.roomId == roomId)
            .toList(),
      );
    });
  }

  @override
  Future<RoomSummary> renameRoom(int roomId, String name) {
    return _backend.respond(() {
      final base = _backend.requireRoom(roomId);
      final membership = _backend.requireMembership(base.homeId);
      if (!membership.role.canRename) _backend.forbidden();
      final trimmed = name.trim();
      if (trimmed.isEmpty || trimmed.length > 64) _backend.invalidInput();
      final index = _backend.rooms.indexWhere((r) => r.id == roomId);
      _backend.rooms[index] = base.copyWith(name: trimmed);
      for (var i = 0; i < _backend.devices.length; i++) {
        if (_backend.devices[i].roomId == roomId) {
          _backend.devices[i] = _backend.devices[i].copyWith(roomName: trimmed);
        }
      }
      _backend.emitHomeChanged(base.homeId);
      return _backend.roomView(_backend.rooms[index], membership);
    });
  }
}
