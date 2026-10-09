// Nhà / phòng phía khách (CONTRACT §4.2 Homes/rooms). Quyền đi qua requireHomeMember/requireRoomAccess
// (404 nhà không thuộc quyền, 403 thiếu vai trò); nhà suspended đọc được, ghi → 409 HOME_SUSPENDED.
import type { RequestMeta } from "../../../lib/clientIp";
import { toIso, withTransaction } from "../../../lib/db";
import { HttpError, notFound } from "../../../lib/http";
import { eventBus } from "../../../lib/eventBus";
import { assertHomeWritable, canViewDevice, hasPermission } from "../../access/permissions";
import { requireHomeMember } from "../../access/access.service";
import type { HomeAccess } from "../../access/access.types";
import type { AuthContext } from "../../auth/auth.types";
import { listHomeDeviceRows } from "../../devices/deviceReadModel";
import type { CustomerDevice } from "../../devices/devices.types";
import { toHome } from "../../homes/homes.mapper";
import { getHomeRow, listRoomSummaries } from "../../homes/homes.repository";
import type { Home, RoomSummary } from "../../homes/homes.types";
import { requireRoomAccess } from "../../homes/roomAccess";
import { logEvent } from "../../logs/logEvent";
import { isOnline } from "../../../lib/time";
import type { MemberRole } from "../../../types/domain";
import type { MyHome } from "../customer.types";
import { toCustomerDevices } from "../devices/deviceView";
import {
  countDevicesByHome,
  countGuestDevices,
  countPendingSuggestions,
  countUnreadNotifications,
  listHomeRowsByIds,
  listMemberships,
  updateHomeFields,
  updateRoomName,
} from "./homes.repository";

export interface HomeOverview {
  home: Home;
  role: MemberRole;
  gateway: { id: number; uid: string; status: "online" | "offline"; last_seen: string | null } | null;
  rooms: RoomSummary[];
  devices: CustomerDevice[];
  open_alerts: number;
  pending_suggestions: number;
  unread_notifications: number;
}

/** GET /homes — mọi nhà tôi là thành viên hiệu lực, kèm vai trò và bộ đếm (GUEST: chỉ thiết bị được cấp). */
export async function listMyHomes(userId: number, onlyHomeId?: number): Promise<MyHome[]> {
  const memberships = await listMemberships(userId, onlyHomeId);
  if (memberships.length === 0) return [];
  const homeIds = memberships.map((m) => m.home_id);
  const [homes, counts, guestCounts] = await Promise.all([
    listHomeRowsByIds(homeIds),
    countDevicesByHome(homeIds),
    countGuestDevices(memberships.filter((m) => m.member_role === "GUEST").map((m) => m.member_id)),
  ]);
  const homeById = new Map(homes.map((home) => [home.id, home]));

  const result: MyHome[] = [];
  for (const m of memberships) {
    const home = homeById.get(m.home_id);
    if (!home) continue;
    const c = (m.member_role === "GUEST" ? guestCounts.get(m.member_id) : counts.get(m.home_id)) ?? {
      device_count: 0,
      online_count: 0,
    };
    result.push({
      home: toHome(home),
      role: m.member_role,
      device_count: c.device_count,
      online_count: c.online_count,
      expires_at: toIso(m.expires_at),
    });
  }
  return result;
}

/** Một phần tử MyHome (dùng sau accept invitation). */
export async function getMyHome(userId: number, homeId: number): Promise<MyHome> {
  const [item] = await listMyHomes(userId, homeId);
  if (!item) throw notFound("Home not found");
  return item;
}

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

function announceHomeChanged(homeId: number): void {
  eventBus.emit("home_changed", { home_id: homeId });
}

export async function patchHome(
  auth: AuthContext,
  homeId: number,
  patch: { name?: string; address?: string | null },
  meta: RequestMeta
): Promise<Home> {
  const access = await requireHomeMember(auth, homeId, "rename");
  assertHomeWritable(access.home);
  if (patch.name === undefined && patch.address === undefined) {
    throw new HttpError(400, "MISSING_FIELDS", "name or address is required");
  }
  await withTransaction((conn) => updateHomeFields(conn, homeId, patch));
  await logEvent({
    eventType: "HOME_RENAMED",
    homeId,
    actorUserId: auth.userId,
    message: `${auth.displayName} cập nhật thông tin nhà "${patch.name ?? access.home.name}"`,
    ip: meta.ip,
    userAgent: meta.userAgent,
    details: { fields: Object.keys(patch) },
  });
  announceHomeChanged(homeId);
  const fresh = await getHomeRow(homeId);
  if (!fresh) throw notFound("Home not found");
  return toHome(fresh);
}

async function roomSummaryFor(access: HomeAccess, roomId: number): Promise<RoomSummary | null> {
  const [summary] = await listRoomSummaries(access.home.id, {
    withClimate: true,
    roomId,
    deviceIds: access.guestDeviceIds,
  });
  return summary ?? null;
}

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
  announceHomeChanged(room.home_id);
  const summary = await roomSummaryFor(access, room.id);
  if (!summary) throw notFound("Room not found");
  return summary;
}
