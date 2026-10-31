// Tập nhà + phạm vi thiết bị của một connection (lọc sự kiện THEO TỪNG CONNECTION: chỉ nhà mà user là thành viên
// hiệu lực; GUEST chỉ thấy thiết bị được phép).
import { getEffectiveMemberAccess, listEffectiveHomeIds } from "../../homes";
import type { Connection, HomeScope } from "./ws-connection";

/** Nạp lại tập nhà + phạm vi thiết bị của user (sau khi đổi thành viên, GUEST hết hạn…). */
export async function loadHomes(userId: number): Promise<Map<number, HomeScope>> {
  const homes = new Map<number, HomeScope>();
  for (const homeId of await listEffectiveHomeIds(userId)) {
    const access = await getEffectiveMemberAccess(userId, homeId);
    if (!access) continue; // vừa hết hạn/bị xoá giữa 2 truy vấn
    homes.set(homeId, { guestDeviceIds: access.guestDeviceIds === null ? null : new Set(access.guestDeviceIds) });
  }
  return homes;
}

export function refreshHomes(conn: Connection): Promise<void> {
  if (conn.userId === null) return Promise.resolve();
  // Gộp các lần refresh chồng nhau (nhiều home_changed liên tiếp) thành một
  if (conn.refreshing) return conn.refreshing;
  const userId = conn.userId;
  conn.refreshing = loadHomes(userId)
    .then((homes) => {
      conn.homes = homes;
    })
    .catch((err: unknown) => {
      console.error("[wsHub] refresh homes failed:", err instanceof Error ? err.message : "unknown error");
    })
    .finally(() => {
      conn.refreshing = null;
    });
  return conn.refreshing;
}
