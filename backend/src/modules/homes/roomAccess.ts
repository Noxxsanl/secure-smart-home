// Truy cập phòng của KHÁCH HÀNG: phòng tồn tại + người dùng có quyền với nhà chứa nó, một lời gọi
// cho mọi endpoint /rooms/:roomId/** (BE-B). Cùng quy tắc 404/403 như requireHomeMember (invariant 6).
import { notFound } from "../../lib/http";
import type { HomeAccess, Permission } from "../access/access.types";
import { requireHomeMember } from "../access/access.service";
import type { AuthContext } from "../auth/auth.types";
import { getRoomRow } from "./homes.repository";
import type { RoomRow } from "./homes.types";

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
