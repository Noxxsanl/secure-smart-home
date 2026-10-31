import { toCount, toIsoRequired } from "../../../infrastructure/database/db";
import type { JobStatus, OtaDeployment } from "./ota.types";

export interface DeploymentRow {
  id: number;
  firmware_id: number;
  firmware_version: string;
  firmware_type: "gateway" | "node";
  scope_type: "system" | "home";
  scope_id: number | null;
  home_name: string | null;
  /** smart_homes.status của nhà đích (null với đợt toàn hệ thống). */
  home_status: string | null;
  status: JobStatus;
  created_at: Date;
  created_by_username: string | null;
  target_count: unknown;
  applied_count: unknown;
  failed_count: unknown;
  avg_progress: unknown;
}

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
