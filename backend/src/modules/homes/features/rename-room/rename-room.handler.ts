// PATCH /rooms/:roomId — đổi tên phòng (CONTRACT §4.2). Cần quyền "rename"; nhà suspended → 409.
import type { RequestMeta } from "../../../../core/http/request-meta";
import type { AuthContext } from "../../../../core/auth/auth-context";
import { notFound } from "../../../../shared/errors/http-error";
import { eventBus } from "../../../../shared/events/event-bus";
import { logEvent } from "../../../audit";
import type { RoomSummary } from "../../domain/home.types";
import { assertHomeWritable } from "../../domain/permissions";
import { requireRoomAccess, roomSummaryFor } from "../../domain/room-access";
import { updateRoomName } from "../../infrastructure/customer-homes.repository";

export async function renameRoom(auth: AuthContext, roomId: number, name: string, meta: RequestMeta): Promise<RoomSummary> {
  const { room, access } = await requireRoomAccess(auth, roomId, "rename");
  assertHomeWritable(access.home);
  await updateRoomName(room.id, name);
  await logEvent({
    eventType: "ROOM_RENAMED",
    homeId: room.home_id,
    actorUserId: auth.userId,
    message: `${auth.displayName} đổi tên phòng "${room.name}" thành "${name}"`,
    ip: meta.ip,
    userAgent: meta.userAgent,
    details: { room_id: room.id },
  });
  eventBus.emit("home_changed", { home_id: room.home_id });
  const summary = await roomSummaryFor(access, room.id);
  if (!summary) throw notFound("Room not found");
  return summary;
}
