// Đọc dữ liệu thô cho habit job: nhật ký thao tác (user_behavior_logs của module control), thiết bị, nhà.
import { queryRows } from "../../../infrastructure/database/db";
import type { BehaviorEvent } from "../domain/habit-pattern";

/** Nhà đang hoạt động (kèm múi giờ) — job chỉ quét nhà 'active'. */
export async function listActiveHomes(): Promise<{ id: number; timezone: string | null }[]> {
  return queryRows<{ id: number; timezone: string | null }>(
    "SELECT id, timezone FROM smart_homes WHERE status = 'active' ORDER BY id"
  );
}

/** Thao tác BẬT/TẮT do người dùng của nhà từ `since`; chỉ relay còn tồn tại của ĐÚNG nhà này. */
export async function loadBehaviorEvents(homeId: number, since: Date): Promise<BehaviorEvent[]> {
  // Join thiết bị để chỉ xét relay còn tồn tại của ĐÚNG nhà này (NFR-S4: truy vấn theo nhà)
  return queryRows<BehaviorEvent>(
    `SELECT l.device_id, d.device_name, l.action, l."timestamp"
       FROM user_behavior_logs l
       JOIN devices d ON d.id = l.device_id AND d.home_id = l.smart_home_id AND d.category = 'relay'
      WHERE l.smart_home_id = ? AND l."timestamp" >= ? AND l.source IN ('mobile', 'manual')
        AND l.action IN ('TURN_ON', 'TURN_OFF')`,
    [homeId, since]
  );
}
