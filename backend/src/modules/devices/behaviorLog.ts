// Nhật ký hành vi người dùng (user_behavior_logs, FR-7.3) — nguyên liệu cho gợi ý thói quen AI.
// weekday / minute_of_day / is_weekend tính theo MÚI GIỜ CỦA NHÀ (lib/time.ts), không theo giờ
// server, để "bật đèn lúc 23:00" nghĩa là 23:00 ở nhà. NFR-S4: dữ liệu chỉ truy vấn theo nhà.
import pool from "../../config/db";
import { newUuid } from "../../lib/crypto";
import { runSql, type Queryable } from "../../lib/db";
import { homeLocalParts } from "../../lib/time";

export type BehaviorAction = "TURN_ON" | "TURN_OFF";
/**
 * Nguồn hành động (CONTRACT §1.2): app mobile → 'mobile'; portal web → 'manual'; rule → 'automation';
 * rule sinh từ gợi ý đã chấp nhận → 'ai_suggested'; console nhân viên → 'dashboard'.
 */
export type BehaviorSource = "manual" | "automation" | "voice" | "mobile" | "dashboard" | "ai_suggested";

export interface BehaviorLogInput {
  homeId: number;
  /** smart_homes.timezone của nhà. */
  timezone: string;
  userId: number | null;
  roomId: number | null;
  deviceId: number;
  /** devices.category, vd "relay". */
  deviceCategory: string;
  action: BehaviorAction;
  /** "ON" | "OFF" | null (chưa biết). */
  previousState: string | null;
  newState: string | null;
  source: BehaviorSource;
  /** Mặc định: bây giờ. */
  at?: Date;
}

/** Ghi một dòng hành vi. KHÔNG BAO GIỜ ném lỗi: log thất bại không được làm hỏng lệnh điều khiển. */
export async function logBehavior(input: BehaviorLogInput, db: Queryable = pool): Promise<void> {
  try {
    const at = input.at ?? new Date();
    const local = homeLocalParts(at, input.timezone);
    await runSql(
      `INSERT INTO user_behavior_logs
         (event_id, timestamp, user_id, smart_home_id, room_id, device_id, device_type, action,
          previous_state, new_state, weekday, minute_of_day, is_weekend, is_holiday, source)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?)`,
      [
        newUuid(),
        at,
        input.userId,
        input.homeId,
        input.roomId,
        input.deviceId,
        input.deviceCategory,
        input.action,
        input.previousState,
        input.newState,
        local.weekday,
        local.minuteOfDay,
        local.weekday === 0 || local.weekday === 6 ? 1 : 0,
        input.source,
      ],
      db
    );
  } catch (err) {
    console.error("[behavior] failed to write behavior log:", err instanceof Error ? err.message : "unknown error");
  }
}
