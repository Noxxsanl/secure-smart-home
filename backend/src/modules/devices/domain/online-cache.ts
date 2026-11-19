// Cache in-memory tập thiết bị đang online, nạp bởi presence monitor (features/presence-monitor) mỗi 15 s.
// Tránh truy vấn DB cho mỗi API request cần biết trạng thái online; có thể trễ tối đa một tick.
// (Vòng lặp heartbeat 30 s cũ của services/deviceStatus.ts (Prototype) không còn caller nào — presence monitor đã thay thế nó.)
import { isOnline as isOnlineAt } from "../../../shared/time";

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

/** Presence monitor tính tập online mỗi 15 s rồi nạp vào cache này. */
export function setOnlineDeviceIds(ids: Iterable<number>): void {
  onlineDeviceIds = new Set(ids);
}
