import { toBool, toIsoRequired } from "../../../infrastructure/database/db";
import type { FirmwareVersion } from "./ota.types";

export interface FirmwareDbRow {
  id: number;
  target_type: "gateway" | "node";
  version: string;
  file_name: string;
  size_bytes: number;
  checksum_sha256: string;
  release_notes: string | null;
  is_stable: boolean;
  created_at: Date;
  uploaded_by_username: string | null;
}

export function toFirmware(row: FirmwareDbRow): FirmwareVersion {
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
