// Chi tiết thiết bị phía khách (CONTRACT §4.2).
// Quyền: requireDeviceAccess (404 nếu không thấy/GUEST không được cấp, 403 nếu thiếu vai trò).
import type { AuthContext } from "../../../../core/auth/auth-context";
import type { MemberRole } from "../../../../shared/types/domain";
import { listRoomSummaries, toHome } from "../../../homes";
import type { Home, RoomSummary } from "../../../homes";
import { requireDeviceAccess } from "../../domain/device-access";
import { toCustomerDeviceOne } from "../../domain/device-view";
import type { CustomerDevice } from "../../domain/device.types";

export async function getDeviceDetail(
  auth: AuthContext,
  deviceId: number
): Promise<{ device: CustomerDevice; room: RoomSummary | null; home: Home; role: MemberRole }> {
  const { device, access } = await requireDeviceAccess(auth, deviceId, "view");
  let room: RoomSummary | null = null;
  if (device.room_id !== null) {
    const [summary] = await listRoomSummaries(access.home.id, {
      withClimate: true,
      roomId: device.room_id,
      deviceIds: access.guestDeviceIds,
    });
    room = summary ?? null;
  }
  return { device: await toCustomerDeviceOne(device, access), room, home: toHome(access.home), role: access.role };
}
