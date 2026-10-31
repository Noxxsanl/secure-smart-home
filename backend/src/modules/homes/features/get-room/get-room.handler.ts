// GET /rooms/:roomId — phòng + thiết bị trong phòng theo góc nhìn của người gọi (CONTRACT §4.2).
// Phòng không tồn tại / nhà không thuộc quyền → 404; GUEST không có thiết bị nào trong phòng → 404.
import type { AuthContext } from "../../../../core/auth/auth-context";
import { notFound } from "../../../../shared/errors/http-error";
import type { MemberRole } from "../../../../shared/types/domain";
import { listHomeDeviceRows, toCustomerDevices } from "../../../devices";
import type { CustomerDevice } from "../../../devices";
import { toHome } from "../../domain/home.mapper";
import type { Home, RoomSummary } from "../../domain/home.types";
import { canViewDevice } from "../../domain/permissions";
import { requireRoomAccess, roomSummaryFor } from "../../domain/room-access";

export async function getRoom(
  auth: AuthContext,
  roomId: number
): Promise<{ room: RoomSummary; home: Home; role: MemberRole; devices: CustomerDevice[] }> {
  const { room, access } = await requireRoomAccess(auth, roomId, "view");
  const summary = await roomSummaryFor(access, room.id);
  if (!summary) throw notFound("Room not found");
  // GUEST không có thiết bị nào được cấp trong phòng → coi như phòng không tồn tại với họ
  if (access.guestDeviceIds !== null && summary.device_count === 0) throw notFound("Room not found");
  const rows = (await listHomeDeviceRows(access.home.id, { includeGateway: false })).filter(
    (row) => row.room_id === room.id && canViewDevice(access, row.id)
  );
  return {
    room: summary,
    home: toHome(access.home),
    role: access.role,
    devices: await toCustomerDevices(rows, access),
  };
}
