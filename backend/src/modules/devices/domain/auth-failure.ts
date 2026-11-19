// Chính sách khoá thiết bị sau nhiều lần xác thực HMAC thất bại — MỘT nơi cho cả đường ingest HTTP lẫn MQTT
// (invariant 4): trước đây mỗi đường giữ một hằng BLOCK_THRESHOLD riêng và dặn "phải khớp nhau".
import type { Queryable } from "../../../infrastructure/database/db";
import { blockDevice, incrementFailCount } from "../infrastructure/device.repository";

// Thiết bị bị tự động khoá sau số lần xác thực thất bại liên tiếp này để ngăn tấn công brute-force vào secret key HMAC.
const BLOCK_THRESHOLD = 5;

export interface AuthFailureResult {
  /** fail_count sau khi tăng. */
  failCount: number;
  /** true khi failCount ≥ ngưỡng và status đã được đặt 'blocked' (kể cả thiết bị vốn đã blocked) — người gọi ghi audit DEVICE_BLOCKED. */
  blocked: boolean;
}

/** Tăng fail_count; đạt ngưỡng thì chặn thiết bị. Thứ tự câu SQL: UPDATE fail_count → SELECT fail_count → (UPDATE status). */
export async function registerAuthFailure(deviceDbId: number, db?: Queryable): Promise<AuthFailureResult> {
  const failCount = await incrementFailCount(deviceDbId, db);
  if (failCount < BLOCK_THRESHOLD) return { failCount, blocked: false };
  await blockDevice(deviceDbId, db);
  return { failCount, blocked: true };
}
