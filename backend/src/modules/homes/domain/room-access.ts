// Truy cập phòng của KHÁCH HÀNG: phòng tồn tại + người dùng có quyền với nhà chứa nó, một lời gọi
// cho mọi endpoint /rooms/:roomId/**. Cùng quy tắc 404/403 như requireHomeMember (invariant 6).
import { notFound } from "../../../shared/errors/http-error";
import type { HomeAccess, Permission } from "./access.types";
import { requireHomeMember } from "./access-policy";
import type { AuthContext } from "../../../core/auth/auth-context";
import { getRoomRow } from "../infrastructure/homes.repository";
import { listRoomSummaries } from "../infrastructure/room.read-model";
import type { RoomRow, RoomSummary } from "./home.types";

/**
 * Trả { room, access }. Phòng không tồn tại hoặc nhà không thuộc quyền → 404 NOT_FOUND; là thành viên
 * nhưng thiếu `permission` → 403 FORBIDDEN. Ví dụ đổi tên phòng: requireRoomAccess(auth, id, "rename").
 */
export async function requireRoomAccess(
  auth: AuthContext,
  roomId: number,
  permission?: Permission
): Promise<{ room: RoomRow; access: HomeAccess }> {
  const room = await getRoomRow(roomId);
  if (!room) throw notFound("Room not found");
  const access = await requireHomeMember(auth, room.home_id, permission);
  return { room, access };
}

/** RoomSummary của một phòng theo góc nhìn của người gọi (GUEST: chỉ đếm thiết bị được cấp). */
export async function roomSummaryFor(access: HomeAccess, roomId: number): Promise<RoomSummary | null> {
  const [summary] = await listRoomSummaries(access.home.id, {
    withClimate: true,
    roomId,
    deviceIds: access.guestDeviceIds,
  });
  return summary ?? null;
}
