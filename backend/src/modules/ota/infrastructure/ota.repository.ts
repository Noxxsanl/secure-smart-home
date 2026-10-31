// SQL ghi OTA: ota_jobs + ota_history (và các đọc thuần trên 2 bảng này). Tiến độ của thiết bị mô phỏng do
// module simulator cập nhật. Đọc có JOIN sang bảng module khác nằm ở ota.read-model.ts.
import {
  placeholders,
  queryOne,
  runSql,
  toCount,
  type Queryable,
  type SqlParam,
} from "../../../infrastructure/database/db";
import pool from "../../../infrastructure/database/pool";
import type { JobStatus } from "../domain/ota.types";

export async function countRunningJobs(): Promise<number> {
  const row = await queryOne<{ total: unknown }>("SELECT COUNT(*) AS total FROM ota_jobs WHERE status = 'running'");
  return toCount(row?.total);
}

export interface JobRow {
  id: number;
  firmware_id: number;
  scope_type: "system" | "home";
  scope_id: number | null;
  status: JobStatus;
}

export async function getJobRow(id: number, db: Queryable = pool): Promise<JobRow | null> {
  return queryOne<JobRow>("SELECT id, firmware_id, scope_type, scope_id, status FROM ota_jobs WHERE id = ?", [id], db);
}

export async function insertJob(
  db: Queryable,
  input: { firmwareId: number; scopeType: "system" | "home"; scopeId: number | null; createdBy: number }
): Promise<number> {
  const result = await runSql(
    "INSERT INTO ota_jobs (firmware_id, scope_type, scope_id, status, created_by) VALUES (?, ?, ?, 'running', ?) RETURNING id",
    [input.firmwareId, input.scopeType, input.scopeId, input.createdBy],
    db
  );
  return result.insertId;
}

const CHUNK = 500;

function chunks<T>(items: readonly T[]): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += CHUNK) out.push(items.slice(i, i + CHUNK));
  return out;
}

/** Mỗi mục tiêu một dòng pending (simulator hoặc ack MQTT sẽ đẩy tiếp). */
export async function insertHistoryRows(db: Queryable, jobId: number, deviceIds: readonly number[]): Promise<void> {
  for (const part of chunks(deviceIds)) {
    const values = part.map(() => "(?, ?)").join(", ");
    const params: SqlParam[] = part.flatMap((deviceId): SqlParam[] => [jobId, deviceId]);
    await runSql(`INSERT INTO ota_history (ota_job_id, device_id) VALUES ${values}`, params, db);
  }
}

/** Đặt trạng thái cho một nhóm thiết bị của job (chỉ dòng còn pending). */
export async function markHistory(
  jobId: number,
  deviceIds: readonly number[],
  status: "downloading" | "failed",
  errorMessage: string | null
): Promise<void> {
  for (const part of chunks(deviceIds)) {
    await runSql(
      `UPDATE ota_history
          SET status = ?, error_message = ?,
              started_at = COALESCE(started_at, NOW()),
              finished_at = CASE WHEN ?::text = 'failed' THEN NOW() ELSE NULL END
        WHERE ota_job_id = ? AND status = 'pending' AND device_id IN (${placeholders(part.length)})`,
      [status, errorMessage, status, jobId, ...part]
    );
  }
}

/** Nếu job không còn dòng pending/downloading → chốt completed / failed_partial. */
export async function finalizeJobIfDone(jobId: number): Promise<void> {
  const open = await queryOne<{ total: unknown }>(
    "SELECT COUNT(*) AS total FROM ota_history WHERE ota_job_id = ? AND status IN ('pending', 'downloading')",
    [jobId]
  );
  if (toCount(open?.total) > 0) return;
  const failed = await queryOne<{ total: unknown }>(
    "SELECT COUNT(*) AS total FROM ota_history WHERE ota_job_id = ? AND status = 'failed'",
    [jobId]
  );
  await runSql(
    "UPDATE ota_jobs SET status = ?, finished_at = NOW() WHERE id = ? AND status = 'running'",
    [toCount(failed?.total) > 0 ? "failed_partial" : "completed", jobId]
  );
}

/** Rollback: dòng chưa xong → rolled_back, job → rolled_back (dòng đã applied giữ nguyên làm bằng chứng). */
export async function rollbackJob(db: Queryable, jobId: number): Promise<void> {
  await runSql(
    `UPDATE ota_history SET status = 'rolled_back', finished_at = NOW()
      WHERE ota_job_id = ? AND status IN ('pending', 'downloading')`,
    [jobId],
    db
  );
  await runSql("UPDATE ota_jobs SET status = 'rolled_back', finished_at = NOW() WHERE id = ?", [jobId], db);
}
