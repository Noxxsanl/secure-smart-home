// Kiểu dữ liệu của domain camera: dòng camera_snapshots và DTO trả cho khách (không có storage_key — đường dẫn/khoá
// lưu trữ không bao giờ lộ ra client).
import type { CameraSnapshotSummary } from "../../../shared/events/event-payloads";
import { toIsoRequired } from "../../../infrastructure/database/db";

export type SnapshotTrigger = "motion" | "request";
export const SNAPSHOT_TRIGGERS: readonly SnapshotTrigger[] = ["motion", "request"];

/** Ảnh JPEG tối đa 200 KB (firmware gateway cắt khung hình QVGA/VGA). */
export const MAX_SNAPSHOT_BYTES = 204_800;
/** Trần số ảnh giữ lại cho mỗi camera (job purge-old-snapshots). */
export const MAX_SNAPSHOTS_PER_CAMERA = 500;

export interface SnapshotRow {
  id: number;
  device_id: number;
  gateway_id: number | null;
  home_id: number | null;
  trigger: SnapshotTrigger;
  command_id: string | null;
  storage_key: string;
  size_bytes: number;
  captured_at: Date;
  created_at: Date;
}

export type { CameraSnapshotSummary };

export function toSnapshotSummary(row: Pick<SnapshotRow, "id" | "trigger" | "size_bytes" | "captured_at">): CameraSnapshotSummary {
  return {
    id: row.id,
    trigger: row.trigger,
    size_bytes: row.size_bytes,
    captured_at: toIsoRequired(row.captured_at),
  };
}
