// Nhật ký hành vi người dùng (user_behavior_logs, FR-7.3) — nguyên liệu cho gợi ý thói quen và dữ liệu huấn luyện AI.
// weekday / minute_of_day / is_weekend tính theo MÚI GIỜ CỦA NHÀ (shared/time.ts), không theo giờ
// server, để "bật đèn lúc 23:00" nghĩa là 23:00 ở nhà. NFR-S4: dữ liệu chỉ truy vấn theo nhà.
//
// MỖI lần trạng thái tải đổi = đúng 1 dòng, dù đổi từ web/mobile/hẹn giờ (đường 1: send-device-command sau ack) hay bấm
// tại chỗ (đường 2: telemetry của Node → record-behavior). Chống dòng thừa/mất dòng bằng KHOÁ DÒNG devices: cả hai đường
// khoá dòng thiết bị, đọc trạng thái trước rồi ghi trạng thái mới trong cùng transaction, nên chỉ bên thật sự làm đổi trạng
// thái mới ghi dòng hành vi (bên kia thấy before == after). Khi telemetry ghi trước, dòng được gán device_command_id của
// lệnh tương ứng. Unique index một phần uq_user_behavior_logs_command + ON CONFLICT DO NOTHING chỉ là lưới an toàn.
import pool from "../../../infrastructure/database/pool";
import { newUuid } from "../../../shared/crypto";
import { runSql, type Queryable } from "../../../infrastructure/database/db";
import { homeLocalParts } from "../../../shared/time";
import type { BehaviorAction, BehaviorAppliance, BehaviorSource } from "../domain/behavior.types";

export interface BehaviorLogInput {
  homeId: number;
  /** smart_homes.timezone của nhà. */
  timezone: string;
  userId: number | null;
  roomId: number | null;
  deviceId: number;
  /** devices.category, vd "relay". */
  deviceCategory: string;
  /** devices.appliance: lamp | fan | curtain | ac (null = relay chưa gán loại). */
  appliance: BehaviorAppliance;
  action: BehaviorAction;
  /** "ON" | "OFF" | null (chưa biết) — theo power, kể cả điều hoà (nhiệt độ nằm ở level_*). */
  previousState: string | null;
  newState: string | null;
  /** % mở rèm / nhiệt độ đặt điều hoà trước và sau; null với đèn/quạt hoặc chưa biết. */
  levelBefore: number | null;
  levelAfter: number | null;
  /** Nhiệt độ/độ ẩm phòng lúc đó (null = không có cảm biến cùng phòng hoặc số đo quá cũ). */
  temperature: number | null;
  humidity: number | null;
  /** device_commands.id của lệnh gốc (null khi bấm tại chỗ) — khoá chống ghi trùng giữa hai đường. */
  deviceCommandId: number | null;
  isSimulated: boolean;
  source: BehaviorSource;
  /** Mặc định: bây giờ. */
  at?: Date;
}

/**
 * Ghi một dòng hành vi. KHÔNG BAO GIỜ ném lỗi: log thất bại không được làm hỏng lệnh điều khiển hay luồng ingest.
 * Trả true khi ghi được dòng mới; false khi bị bỏ qua (trùng device_command_id) hoặc lỗi.
 */
export async function recordBehavior(input: BehaviorLogInput, db: Queryable = pool): Promise<boolean> {
  try {
    const at = input.at ?? new Date();
    const local = homeLocalParts(at, input.timezone);
    const result = await runSql(
      `INSERT INTO user_behavior_logs
         (event_id, "timestamp", user_id, smart_home_id, room_id, device_id, device_type, appliance, action,
          previous_state, new_state, level_before, level_after, temperature, humidity, device_command_id, is_simulated,
          weekday, minute_of_day, is_weekend, is_holiday, source)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, FALSE, ?)
       ON CONFLICT (device_command_id) WHERE device_command_id IS NOT NULL DO NOTHING`,
      [
        newUuid(),
        at,
        input.userId,
        input.homeId,
        input.roomId,
        input.deviceId,
        input.deviceCategory,
        input.appliance,
        input.action,
        input.previousState,
        input.newState,
        input.levelBefore,
        input.levelAfter,
        input.temperature,
        input.humidity,
        input.deviceCommandId,
        input.isSimulated,
        local.weekday,
        local.minuteOfDay,
        local.weekday === 0 || local.weekday === 6,
        input.source,
      ],
      db
    );
    return result.affectedRows > 0;
  } catch (err) {
    console.error("[behavior] failed to write behavior log:", err instanceof Error ? err.message : "unknown error");
    return false;
  }
}
