// Danh sách "nhà của tôi" (CONTRACT §4.2 Homes/rooms): dùng chung bởi list-my-homes và accept-invitation
// (trả MyHome vừa tham gia), nên nằm ở domain/ thay vì trong một feature.
import { toIso } from "../../../infrastructure/database/db";
import { notFound } from "../../../shared/errors/http-error";
import { toHome } from "./home.mapper";
import type { MyHome } from "./my-home.types";
import { listHomeRowsByIds } from "../infrastructure/home.read-model";
import { listMemberships } from "../infrastructure/customer-homes.repository";
import { countDevicesByHome, countGuestDevices } from "../infrastructure/customer-homes.read-model";

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
