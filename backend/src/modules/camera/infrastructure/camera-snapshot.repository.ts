// SQL bảng camera_snapshots (module camera là chủ duy nhất ghi bảng này). Metadata ảnh; file JPEG nằm ở SnapshotStore.
import pool from "../../../infrastructure/database/pool";
import { placeholders, queryOne, queryRows, runSql, sqlLimit, type Queryable } from "../../../infrastructure/database/db";
import type { SnapshotRow, SnapshotTrigger } from "../domain/camera.types";

const SNAPSHOT_COLUMNS =
  "id, device_id, gateway_id, home_id, trigger, command_id, storage_key, size_bytes, captured_at, created_at";

export interface NewSnapshot {
  deviceId: number;
  gatewayId: number | null;
  homeId: number | null;
  trigger: SnapshotTrigger;
  commandId: string | null;
  storageKey: string;
  sizeBytes: number;
  capturedAt: Date;
}

export async function insertSnapshot(input: NewSnapshot, db: Queryable = pool): Promise<number> {
  const result = await runSql(
    `INSERT INTO camera_snapshots
       (device_id, gateway_id, home_id, trigger, command_id, storage_key, size_bytes, captured_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)
     RETURNING id`,
    [
      input.deviceId,
      input.gatewayId,
      input.homeId,
      input.trigger,
      input.commandId,
      input.storageKey,
      input.sizeBytes,
      input.capturedAt,
    ],
    db
  );
  return result.insertId;
}

export async function getSnapshotRow(id: number, db: Queryable = pool): Promise<SnapshotRow | null> {
  return queryOne<SnapshotRow>(`SELECT ${SNAPSHOT_COLUMNS} FROM camera_snapshots WHERE id = ?`, [id], db);
}

/**
 * Ảnh của một camera, mới nhất trước. Chỉ lấy ảnh có home_id = nhà HIỆN TẠI của camera: ảnh chỉ thuộc về nhà lúc chụp,
 * camera chuyển sang nhà khác thì chủ mới không thấy ảnh cũ (và ngược lại).
 */
export async function listSnapshotsByDevice(
  deviceId: number,
  homeId: number,
  limit: number,
  db: Queryable = pool
): Promise<SnapshotRow[]> {
  return queryRows<SnapshotRow>(
    `SELECT ${SNAPSHOT_COLUMNS} FROM camera_snapshots WHERE device_id = ? AND home_id = ? ORDER BY created_at DESC, id DESC LIMIT ?`,
    [deviceId, homeId, sqlLimit(limit)],
    db
  );
}

export interface PurgeCandidate {
  id: number;
  storage_key: string;
}

/** Ảnh tạo trước `cutoff` (index idx_camera_snapshots_created). */
export async function listSnapshotsCreatedBefore(cutoff: Date, limit: number, db: Queryable = pool): Promise<PurgeCandidate[]> {
  return queryRows<PurgeCandidate>(
    "SELECT id, storage_key FROM camera_snapshots WHERE created_at < ? ORDER BY created_at LIMIT ?",
    [cutoff, sqlLimit(limit)],
    db
  );
}

/** Ảnh vượt trần `maxPerCamera` của từng camera (giữ các ảnh mới nhất). */
export async function listSnapshotsOverCap(maxPerCamera: number, limit: number, db: Queryable = pool): Promise<PurgeCandidate[]> {
  return queryRows<PurgeCandidate>(
    `SELECT id, storage_key FROM (
       SELECT id, storage_key,
              ROW_NUMBER() OVER (PARTITION BY device_id ORDER BY created_at DESC, id DESC) AS rn
         FROM camera_snapshots
     ) ranked
      WHERE rn > ?
      LIMIT ?`,
    [maxPerCamera, sqlLimit(limit)],
    db
  );
}

export async function deleteSnapshotsByIds(ids: readonly number[], db: Queryable = pool): Promise<number> {
  if (ids.length === 0) return 0;
  const result = await runSql(`DELETE FROM camera_snapshots WHERE id IN (${placeholders(ids.length)})`, [...ids], db);
  return result.affectedRows;
}
