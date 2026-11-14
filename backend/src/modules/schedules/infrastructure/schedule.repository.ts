// SQL GHI bảng scheduled_actions (module schedules là chủ duy nhất). Đọc có JOIN bảng khác nằm ở schedule.read-model.ts.
import pool from "../../../infrastructure/database/pool";
import { queryOne, runSql, withTransaction, type Queryable } from "../../../infrastructure/database/db";
import type { ScheduleChannel, ScheduleOrigin } from "../domain/schedule.types";

/** Khoá advisory (nhóm 1) để tuần tự hoá "đếm rồi chèn" của cùng một nhà — tránh 2 request đồng thời cùng vượt trần. */
const ADVISORY_NAMESPACE = 7101;

export interface NewSchedule {
  homeId: number;
  deviceId: number;
  /** Chuỗi DeviceCommandAction (turn_on | turn_off | set_temp_<NN> | set_pos_<N>). */
  action: string;
  runAt: Date;
  origin: ScheduleOrigin;
  channel: ScheduleChannel;
  createdByUserId: number;
}

/**
 * Chèn lịch nếu nhà còn dưới `limit` lịch `scheduled`; trả id mới, hoặc null khi đã đủ. Đếm + chèn nằm trong một
 * transaction giữ khoá advisory theo nhà nên hai request song song không cùng lọt qua trần.
 */
export async function insertScheduleIfUnderLimit(input: NewSchedule, limit: number): Promise<number | null> {
  return withTransaction(async (conn) => {
    await runSql("SELECT pg_advisory_xact_lock(?, ?)", [ADVISORY_NAMESPACE, input.homeId], conn);
    const count = await queryOne<{ n: number }>(
      "SELECT COUNT(*) AS n FROM scheduled_actions WHERE home_id = ? AND status = 'scheduled'",
      [input.homeId],
      conn
    );
    if (Number(count?.n ?? 0) >= limit) return null;
    const result = await runSql(
      `INSERT INTO scheduled_actions (home_id, device_id, action, run_at, status, origin, channel, created_by_user_id)
       VALUES (?, ?, ?, ?, 'scheduled', ?, ?, ?) RETURNING id`,
      [input.homeId, input.deviceId, input.action, input.runAt, input.origin, input.channel, input.createdByUserId],
      conn
    );
    return result.insertId;
  });
}

/**
 * Huỷ lịch: UPDATE có điều kiện `status = 'scheduled'` nên chống được race với runner (runner chuyển sang
 * 'running' trước thì 0 dòng bị ảnh hưởng). Trả true nếu huỷ được.
 */
export async function cancelScheduled(id: number, cancelledByUserId: number, db: Queryable = pool): Promise<boolean> {
  const result = await runSql(
    `UPDATE scheduled_actions
        SET status = 'cancelled', cancelled_at = NOW(), cancelled_by_user_id = ?, updated_at = NOW()
      WHERE id = ? AND status = 'scheduled'`,
    [cancelledByUserId, id],
    db
  );
  return result.affectedRows > 0;
}

// ── Runner ─────────────────────────────────────────────────────────────────

/** Số lịch tối đa runner giành quyền mỗi lượt. */
export const CLAIM_BATCH_SIZE = 20;

/**
 * Giành quyền chạy các lịch đến hạn bằng MỘT câu: chuyển scheduled → running; `FOR UPDATE SKIP LOCKED` để hai
 * tiến trình/lượt không bao giờ lấy trùng một lịch. `UPDATE … RETURNING` không đảm bảo thứ tự dòng trả về (kể cả khi
 * subquery có ORDER BY) nên trả kèm run_at và sắp lại ở đây: lịch đến hạn sớm hơn chạy trước, hoà thì id nhỏ trước.
 */
export async function claimDueSchedules(): Promise<number[]> {
  const result = await pool.query<{ id: number | string; run_at: Date }>(
    `UPDATE scheduled_actions SET status = 'running', updated_at = NOW()
      WHERE id IN (SELECT id FROM scheduled_actions
                    WHERE status = 'scheduled' AND run_at <= NOW()
                    ORDER BY run_at, id LIMIT ${CLAIM_BATCH_SIZE}
                    FOR UPDATE SKIP LOCKED)
    RETURNING id, run_at`
  );
  return result.rows
    .map((row) => ({ id: Number(row.id), runAt: new Date(row.run_at).getTime() }))
    .sort((a, b) => a.runAt - b.runAt || a.id - b.id)
    .map((row) => row.id);
}

/** Ngưỡng coi lịch 'running' là mồ côi: một tick xử lý tối đa 20 lịch × ≤ 15 s (ack lệnh) ≈ 5 phút nên chọn 10 phút. */
const STUCK_RUNNING_MINUTES = 10;

/**
 * Lịch kẹt 'running' quá 10 phút (tiến trình chết giữa chừng) → failed/INTERRUPTED. Trả số lịch đã xử lý.
 * GIẢ ĐỊNH MỘT tiến trình backend: lịch 'running' mà không có tiến trình nào đang xử lý là mồ côi. Chạy nhiều bản backend
 * song song thì ngưỡng này có thể đánh nhầm lịch của tiến trình khác đang chạy dở — khi đó cần cột heartbeat/owner.
 */
export async function failInterruptedSchedules(): Promise<number> {
  const result = await runSql(
    `UPDATE scheduled_actions SET status = 'failed', error_code = 'INTERRUPTED', executed_at = NOW(), updated_at = NOW()
      WHERE status = 'running' AND updated_at < NOW() - make_interval(mins => ?::int)`,
    [STUCK_RUNNING_MINUTES]
  );
  return result.affectedRows;
}

export interface ScheduleOutcome {
  status: "done" | "skipped" | "failed" | "cancelled" | "missed";
  errorCode?: string | null;
  deviceCommandId?: number | null;
}

/**
 * Ghi kết quả của một lịch đang 'running'. Điều kiện `status = 'running'` để không ghi đè lịch đã bị xử lý bởi
 * đường khác. 'cancelled' (mất quyền) ghi cancelled_at; các kết quả còn lại ghi executed_at.
 */
export async function finishSchedule(id: number, outcome: ScheduleOutcome): Promise<boolean> {
  // Hai câu tách riêng (thay vì CASE WHEN ? = …) để PostgreSQL không phải suy kiểu cho tham số lặp lại
  const timeColumn = outcome.status === "cancelled" ? "cancelled_at" : "executed_at";
  const result = await runSql(
    `UPDATE scheduled_actions
        SET status = ?, error_code = ?, device_command_id = ?, ${timeColumn} = NOW(), updated_at = NOW()
      WHERE id = ? AND status = 'running'`,
    [outcome.status, outcome.errorCode ?? null, outcome.deviceCommandId ?? null, id]
  );
  return result.affectedRows > 0;
}
