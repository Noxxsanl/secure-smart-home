import 'room.dart';

/// Room reads/writes under `/api/mobile/rooms/**`.
abstract class RoomRepository {
  /// `GET /rooms/:roomId` — fresh room + its devices.
  Future<RoomDetail> getRoom(int roomId);

  /// `PATCH /rooms/:roomId` (OWNER/CONTROLLER).
  Future<RoomSummary> renameRoom(int roomId, String name);
}
