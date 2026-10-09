// SQL bảng firmware (metadata; file nhị phân nằm ở FIRMWARE_STORAGE_DIR, đặt tên theo SHA-256).
import { queryOne, queryRows, runSql, toBool, toIsoRequired } from "../../../lib/db";
import type { FirmwareVersion } from "../dashboard.types";

interface FirmwareDbRow {
  id: number;
  target_type: "gateway" | "node";
  version: string;
  file_name: string;
  size_bytes: number;
  checksum_sha256: string;
  release_notes: string | null;
  is_stable: number;
  created_at: Date;
  uploaded_by_username: string | null;
}

const FIRMWARE_SELECT_SQL = `
  SELECT f.id, f.target_type, f.version, f.file_name, f.size_bytes, f.checksum_sha256, f.release_notes,
         f.is_stable, f.created_at, u.username AS uploaded_by_username
    FROM firmware f
    LEFT JOIN users u ON u.id = f.uploaded_by`;

function toFirmware(row: FirmwareDbRow): FirmwareVersion {
  return {
    id: row.id,
    type: row.target_type,
    version: row.version,
    stable: toBool(row.is_stable),
    released_at: toIsoRequired(row.created_at),
    file_name: row.file_name,
    // KB 1 chữ số thập phân (file nhỏ vẫn hiện số có nghĩa)
    size_kb: Math.round((row.size_bytes / 1024) * 10) / 10,
    checksum_sha256: row.checksum_sha256,
    release_notes: row.release_notes,
    uploaded_by_username: row.uploaded_by_username,
  };
}

export async function listFirmware(): Promise<FirmwareVersion[]> {
  const rows = await queryRows<FirmwareDbRow>(`${FIRMWARE_SELECT_SQL} ORDER BY f.id DESC`);
  return rows.map(toFirmware);
}

export async function getFirmware(id: number): Promise<FirmwareVersion | null> {
  const row = await queryOne<FirmwareDbRow>(`${FIRMWARE_SELECT_SQL} WHERE f.id = ?`, [id]);
  return row ? toFirmware(row) : null;
}

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
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [input.type, input.version, input.fileName, input.sizeBytes, input.checksum, input.storagePath, input.releaseNotes, input.stable ? 1 : 0, input.uploadedBy]
  );
  return result.insertId;
}

export async function setFirmwareStable(id: number, stable: boolean): Promise<void> {
  await runSql("UPDATE firmware SET is_stable = ? WHERE id = ?", [stable ? 1 : 0, id]);
}
