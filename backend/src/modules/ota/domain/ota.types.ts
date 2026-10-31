// DTO Dashboard của firmware/OTA (CONTRACT_V2 §5). Khớp frontend/packages/api-client/src/dashboard/types.ts.

export interface FirmwareVersion {
  id: number;
  type: "gateway" | "node";
  version: string;
  stable: boolean;
  released_at: string;
  file_name: string;
  size_kb: number;
  checksum_sha256: string;
  release_notes: string | null;
  uploaded_by_username: string | null;
}

export interface OtaDeployment {
  id: number;
  firmware_id: number;
  firmware_version: string;
  firmware_type: "gateway" | "node";
  scope: "fleet" | "home";
  target_home_id: number | null;
  target_home_name: string | null;
  progress_percent: number;
  target_count: number;
  applied_count: number;
  failed_count: number;
  status: "in_progress" | "completed" | "rolled_back" | "failed";
  started_at: string;
  created_by_username: string | null;
}

/** Trạng thái ota_jobs trong DB (DTO gộp lại thành in_progress/completed/failed/rolled_back). */
export type JobStatus = "running" | "completed" | "failed_partial" | "rolled_back";
