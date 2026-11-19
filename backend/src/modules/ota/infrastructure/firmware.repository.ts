// SQL bảng firmware (metadata; file nhị phân nằm ở FIRMWARE_STORAGE_DIR, đặt tên theo SHA-256).
// Đọc kèm tên người tải lên ở firmware.read-model.ts.
import { queryOne, runSql } from "../../../infrastructure/database/db";

/** Cột cần cho lệnh OTA (checksum) — không cần storage_path. */
export async function getFirmwareForDeploy(id: number): Promise<{ id: number; version: string; target_type: "gateway" | "node"; checksum_sha256: string } | null> {
  return queryOne<{ id: number; version: string; target_type: "gateway" | "node"; checksum_sha256: string }>(`SELECT id, version, target_type, checksum_sha256 FROM firmware WHERE id = ?`, [id]);
}

export async function firmwareVersionExists(type: "gateway" | "node", version: string): Promise<boolean> {
  const row = await queryOne<{ id: number }>("SELECT id FROM firmware WHERE target_type = ? AND version = ?", [type, version]);
  return row !== null;
}

export async function insertFirmware(input: {
  type: "gateway" | "node";
  version: string;
  fileName: string;
  sizeBytes: number;
  checksum: string;
  storagePath: string;
  releaseNotes: string | null;
  stable: boolean;
  uploadedBy: number;
}): Promise<number> {
  const result = await runSql(
    `INSERT INTO firmware
       (target_type, version, file_name, size_bytes, checksum_sha256, storage_path, release_notes, is_stable, uploaded_by)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
     RETURNING id`,
    [input.type, input.version, input.fileName, input.sizeBytes, input.checksum, input.storagePath, input.releaseNotes, input.stable, input.uploadedBy]
  );
  return result.insertId;
}

export async function setFirmwareStable(id: number, stable: boolean): Promise<void> {
  await runSql("UPDATE firmware SET is_stable = ? WHERE id = ?", [stable, id]);
}
