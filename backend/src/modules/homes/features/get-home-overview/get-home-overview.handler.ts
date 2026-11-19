// GET /homes/:homeId/overview — tổng quan nhà cho khách (CONTRACT §4.2). Quyền đi qua requireHomeMember
// (404 nhà không thuộc quyền, 403 thiếu vai trò).
import { toIso } from "../../../../infrastructure/database/db";
import { isOnline } from "../../../../shared/time";
import type { AuthContext } from "../../../../core/auth/auth-context";
import { listHomeDeviceRows, toCustomerDevices } from "../../../devices";
import { requireHomeMember } from "../../domain/access-policy";
import { toHome } from "../../domain/home.mapper";
import { hasPermission } from "../../domain/permissions";
import { listRoomSummaries } from "../../infrastructure/room.read-model";
import { countPendingSuggestions, countUnreadNotifications } from "../../infrastructure/customer-homes.read-model";
import type { HomeOverview } from "./get-home-overview.dto";

export async function getOverview(auth: AuthContext, homeId: number): Promise<HomeOverview> {
  const access = await requireHomeMember(auth, homeId, "view");
  const canSeeAutomation = hasPermission(access, "view_automation");
  const [rows, rooms, unread, pending] = await Promise.all([
    listHomeDeviceRows(homeId, { includeGateway: true }),
    listRoomSummaries(homeId, { withClimate: true, deviceIds: access.guestDeviceIds }),
    countUnreadNotifications(auth.userId, homeId),
    canSeeAutomation ? countPendingSuggestions(homeId) : Promise.resolve(0),
  ]);
  const gatewayRow = rows.find((row) => row.device_type === "gateway") ?? null;
  const devices = await toCustomerDevices(rows, access);

  return {
    home: toHome(access.home),
    role: access.role,
    gateway: gatewayRow
      ? {
          id: gatewayRow.id,
          uid: gatewayRow.device_id,
          status: isOnline(gatewayRow.last_seen) ? "online" : "offline",
          last_seen: toIso(gatewayRow.last_seen),
        }
      : null,
    // GUEST không thấy phòng chưa được cấp thiết bị nào
    rooms: access.guestDeviceIds === null ? rooms : rooms.filter((room) => room.device_count > 0),
    devices,
    open_alerts: unread.alerts,
    pending_suggestions: pending,
    unread_notifications: unread.unread,
  };
}
