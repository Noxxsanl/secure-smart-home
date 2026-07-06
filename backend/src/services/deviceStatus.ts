import pool from "../config/db";

// Cache in-memory: cập nhật mỗi 30 giây bởi heartbeat monitor.
// Tránh truy vấn DB cho mỗi API request cần biết trạng thái online.
// Có thể trễ tối đa 30s nhưng chấp nhận được cho màn hình dashboard.
let onlineDeviceIds = new Set<number>();

// isOnline kiểm tra last_seen trực tiếp với thời gian hiện tại (dùng trong câu SQL).
// isOnlineFromCache dùng Set in-memory (dùng trong code Node.js để tránh query thêm).
export function isOnline(lastSeen: Date | string | null): boolean {
  if (!lastSeen) return false;
  const diffSeconds = (Date.now() - new Date(lastSeen).getTime()) / 1000;
  return diffSeconds < 60;
}

export function isOnlineFromCache(deviceId: number): boolean {
  return onlineDeviceIds.has(deviceId);
}

export function getOnlineDeviceIds(): ReadonlySet<number> {
  return onlineDeviceIds;
}

async function tick(): Promise<void> {
  try {
    const [rows] = await pool.execute<any[]>(
      `SELECT id FROM devices
       WHERE last_seen IS NOT NULL AND TIMESTAMPDIFF(SECOND, last_seen, NOW()) < 60`
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
