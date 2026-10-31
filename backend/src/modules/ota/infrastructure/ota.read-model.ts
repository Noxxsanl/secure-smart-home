// Đọc OTA có JOIN bảng module khác: đợt triển khai (tên nhà, người tạo) và mục tiêu (devices).
import { queryOne, queryRows, sqlLimit, type SqlParam } from "../../../infrastructure/database/db";
import { toDeployment, type DeploymentRow } from "../domain/deployment.mapper";
import type { OtaDeployment } from "../domain/ota.types";

// Đếm bằng truy vấn con tương quan (không GROUP BY) để tương thích ONLY_FULL_GROUP_BY
const DEPLOYMENT_SELECT_SQL = `
  SELECT j.id, j.firmware_id, f.version AS firmware_version, f.target_type AS firmware_type,
         j.scope_type, j.scope_id, h.name AS home_name, h.status AS home_status, j.status, j.created_at, cu.username AS created_by_username,
         (SELECT COUNT(*) FROM ota_history oh WHERE oh.ota_job_id = j.id) AS target_count,
         (SELECT COUNT(*) FROM ota_history oh WHERE oh.ota_job_id = j.id AND oh.status = 'applied') AS applied_count,
         (SELECT COUNT(*) FROM ota_history oh WHERE oh.ota_job_id = j.id AND oh.status = 'failed') AS failed_count,
         (SELECT AVG(oh.progress_percent) FROM ota_history oh WHERE oh.ota_job_id = j.id) AS avg_progress
    FROM ota_jobs j
    JOIN firmware f ON f.id = j.firmware_id
    LEFT JOIN smart_homes h ON j.scope_type = 'home' AND h.id = j.scope_id
    LEFT JOIN users cu ON cu.id = j.created_by`;

export async function listDeployments(opts: { inProgressOnly?: boolean; limit: number }): Promise<OtaDeployment[]> {
  const where = opts.inProgressOnly ? "WHERE j.status = 'running'" : "";
  const rows = await queryRows<DeploymentRow>(`${DEPLOYMENT_SELECT_SQL} ${where} ORDER BY j.id DESC LIMIT ?`, [sqlLimit(opts.limit)]);
  return rows.map(toDeployment);
}

/** Như listDeployments nhưng kèm trạng thái nhà đích — để che tên nhà khách với Operator chưa có grant (FR-9.6). */
export async function listDeploymentsWithHomeStatus(opts: {
  limit: number;
}): Promise<{ deployment: OtaDeployment; homeStatus: string | null }[]> {
  const rows = await queryRows<DeploymentRow>(`${DEPLOYMENT_SELECT_SQL} ORDER BY j.id DESC LIMIT ?`, [sqlLimit(opts.limit)]);
  return rows.map((row) => ({ deployment: toDeployment(row), homeStatus: row.home_status }));
}

export async function getDeployment(id: number): Promise<OtaDeployment | null> {
  const row = await queryOne<DeploymentRow>(`${DEPLOYMENT_SELECT_SQL} WHERE j.id = ?`, [id]);
  return row ? toDeployment(row) : null;
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
