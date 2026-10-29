// SQL OTA: ota_jobs + ota_history. Tiến độ của thiết bị mô phỏng do simulator (BE-D) cập nhật.
import { placeholders, queryOne, queryRows, runSql, sqlLimit, toCount, toIsoRequired, type Queryable, type SqlParam } from "../../../lib/db";
import pool from "../../../config/db";
import type { OtaDeployment } from "../dashboard.types";

type JobStatus = "running" | "completed" | "failed_partial" | "rolled_back";

interface DeploymentRow {
  id: number;
  firmware_id: number;
  firmware_version: string;
  firmware_type: "gateway" | "node";
  scope_type: "system" | "home";
  scope_id: number | null;
  home_name: string | null;
  status: JobStatus;
  created_at: Date;
  created_by_username: string | null;
  target_count: unknown;
  applied_count: unknown;
  failed_count: unknown;
  avg_progress: unknown;
}

// Đếm bằng truy vấn con tương quan (không GROUP BY) để tương thích ONLY_FULL_GROUP_BY
const DEPLOYMENT_SELECT_SQL = `
  SELECT j.id, j.firmware_id, f.version AS firmware_version, f.target_type AS firmware_type,
         j.scope_type, j.scope_id, h.name AS home_name, j.status, j.created_at, cu.username AS created_by_username,
         (SELECT COUNT(*) FROM ota_history oh WHERE oh.ota_job_id = j.id) AS target_count,
         (SELECT COUNT(*) FROM ota_history oh WHERE oh.ota_job_id = j.id AND oh.status = 'applied') AS applied_count,
         (SELECT COUNT(*) FROM ota_history oh WHERE oh.ota_job_id = j.id AND oh.status = 'failed') AS failed_count,
         (SELECT AVG(oh.progress_percent) FROM ota_history oh WHERE oh.ota_job_id = j.id) AS avg_progress
    FROM ota_jobs j
    JOIN firmware f ON f.id = j.firmware_id
    LEFT JOIN smart_homes h ON j.scope_type = 'home' AND h.id = j.scope_id
    LEFT JOIN users cu ON cu.id = j.created_by`;

const STATUS_MAP: Record<JobStatus, OtaDeployment["status"]> = {
  running: "in_progress",
  completed: "completed",
  failed_partial: "failed",
  rolled_back: "rolled_back",
};

export function toDeployment(row: DeploymentRow): OtaDeployment {
  return {
    id: row.id,
    firmware_id: row.firmware_id,
    firmware_version: row.firmware_version,
    firmware_type: row.firmware_type,
    scope: row.scope_type === "system" ? "fleet" : "home",
    target_home_id: row.scope_type === "home" ? row.scope_id : null,
    target_home_name: row.scope_type === "home" ? row.home_name : null,
    progress_percent: Math.round(Number(row.avg_progress ?? 0)) || 0,
    target_count: toCount(row.target_count),
    applied_count: toCount(row.applied_count),
    failed_count: toCount(row.failed_count),
    status: STATUS_MAP[row.status],
    started_at: toIsoRequired(row.created_at),
    created_by_username: row.created_by_username,
  };
}

export async function listDeployments(opts: { inProgressOnly?: boolean; limit: number }): Promise<OtaDeployment[]> {
  const where = opts.inProgressOnly ? "WHERE j.status = 'running'" : "";
  const rows = await queryRows<DeploymentRow>(`${DEPLOYMENT_SELECT_SQL} ${where} ORDER BY j.id DESC LIMIT ?`, [sqlLimit(opts.limit)]);
  return rows.map(toDeployment);
}

export async function getDeployment(id: number): Promise<OtaDeployment | null> {
  const row = await queryOne<DeploymentRow>(`${DEPLOYMENT_SELECT_SQL} WHERE j.id = ?`, [id]);
  return row ? toDeployment(row) : null;
}

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

// ── Mục tiêu ───────────────────────────────────────────────────────────────

export interface OtaTarget {
  id: number;
  gateway_device_id: number | null;
  is_simulated: boolean;
}

/** Gateway (type gateway) hoặc thiết bị không phải gateway (type node) đã gán nhà; homeId = giới hạn một nhà. */
export async function listTargets(type: "gateway" | "node", homeId: number | null): Promise<OtaTarget[]> {
  const params: SqlParam[] = [];
  let homeFilter = "";
  if (homeId !== null) {
    homeFilter = "AND d.home_id = ?";
    params.push(homeId);
  }
  const typeFilter = type === "gateway" ? "d.device_type = 'gateway'" : "d.device_type <> 'gateway'";
  return queryRows<OtaTarget>(
    `SELECT d.id, d.gateway_device_id, d.is_simulated FROM devices d
      WHERE ${typeFilter} AND d.home_id IS NOT NULL ${homeFilter} ORDER BY d.id`,
    params
  );
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
