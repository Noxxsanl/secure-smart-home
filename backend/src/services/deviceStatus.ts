import { queryRows } from "../lib/db";
import { ONLINE_WINDOW_SECONDS, isOnline as isOnlineAt } from "../lib/time";

// Cache in-memory: cập nhật mỗi 30 giây bởi heartbeat monitor.
// Tránh truy vấn DB cho mỗi API request cần biết trạng thái online.
// Có thể trễ tối đa 30s nhưng chấp nhận được cho màn hình dashboard.
// (V2: modules/devices/deviceMonitor.ts sẽ thay vòng lặp này bằng tick 15 s và phát sự kiện chuyển
// trạng thái; các export bên dưới vẫn giữ nguyên để code cũ không gãy.)
let onlineDeviceIds = new Set<number>();

// isOnline kiểm tra last_seen với thời gian hiện tại (dùng trong code Node.js).
// isOnlineFromCache dùng Set in-memory (dùng trong code Node.js để tránh query thêm).
// Cửa sổ online là ONLINE_WINDOW_SECONDS (90 s, NFR-R1) — cùng hằng số với toàn bộ code V2.
export function isOnline(lastSeen: Date | string | null): boolean {
  return isOnlineAt(lastSeen);
}

export function isOnlineFromCache(deviceId: number): boolean {
  return onlineDeviceIds.has(deviceId);
}

export function getOnlineDeviceIds(): ReadonlySet<number> {
  return onlineDeviceIds;
}

/**
 * V2: device monitor (modules/devices/deviceMonitor.ts) tính tập online mỗi 15 s rồi nạp vào cache này
 * để isOnlineFromCache/getOnlineDeviceIds của code cũ vẫn đúng mà không cần vòng lặp thứ hai.
 */
export function setOnlineDeviceIds(ids: Iterable<number>): void {
  onlineDeviceIds = new Set(ids);
}

async function tick(): Promise<void> {
  try {
    const rows = await queryRows<{ id: number }>(
      `SELECT id FROM devices
       WHERE last_seen IS NOT NULL AND last_seen > NOW() - make_interval(secs => ${ONLINE_WINDOW_SECONDS})`
    );
    onlineDeviceIds = new Set(rows.map((r) => r.id));
  } catch {
    // never crash the main flow
  }
}

export function startHeartbeatMonitor(): void {
  tick();
  setInterval(tick, 30_000);
}
