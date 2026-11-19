import '../../../core/utils/json.dart';
import '../domain/room.dart';

/// Contract §3 `RoomSummary`.
RoomSummary roomFromJson(Json json) => RoomSummary(
  id: json.readInt('id'),
  homeId: json.readIntOrNull('home_id') ?? 0,
  name: json.readString('name', fallback: 'Phòng'),
  roomType: json.readString('room_type', fallback: 'living_room'),
  sortOrder: json.readIntOrNull('sort_order') ?? 0,
  temperature: json.readDoubleOrNull('temperature'),
  humidity: json.readDoubleOrNull('humidity'),
  hasClimateData:
      json.readBoolOrNull('has_climate_data') ??
      (json.readDoubleOrNull('temperature') != null),
  climateUpdatedAt: json.readDateOrNull('climate_updated_at'),
  deviceCount: json.readIntOrNull('device_count') ?? 0,
  onlineCount: json.readIntOrNull('online_count') ?? 0,
  onCount: json.readIntOrNull('on_count') ?? 0,
);
