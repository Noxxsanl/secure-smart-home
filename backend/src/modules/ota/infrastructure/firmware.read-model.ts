// Đọc bảng firmware kèm tên người tải lên (JOIN users của module identity).
import { queryOne, queryRows } from "../../../infrastructure/database/db";
import { toFirmware, type FirmwareDbRow } from "../domain/firmware.mapper";
import type { FirmwareVersion } from "../domain/ota.types";

const FIRMWARE_SELECT_SQL = `
  SELECT f.id, f.target_type, f.version, f.file_name, f.size_bytes, f.checksum_sha256, f.release_notes,
         f.is_stable, f.created_at, u.username AS uploaded_by_username
    FROM firmware f
    LEFT JOIN users u ON u.id = f.uploaded_by`;

export async function listFirmware(): Promise<FirmwareVersion[]> {
  const rows = await queryRows<FirmwareDbRow>(`${FIRMWARE_SELECT_SQL} ORDER BY f.id DESC`);
  return rows.map(toFirmware);
}

export async function getFirmware(id: number): Promise<FirmwareVersion | null> {
  const row = await queryOne<FirmwareDbRow>(`${FIRMWARE_SELECT_SQL} WHERE f.id = ?`, [id]);
  return row ? toFirmware(row) : null;
}
