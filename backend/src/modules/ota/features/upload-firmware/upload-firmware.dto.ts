// Input upload firmware: metadata nằm ở query string (body là nhị phân thô, xem route trong ota.module.ts).
import { optionalBool, optionalString, queryString, requireEnum, requireString } from "../../../../shared/validation/validate";

const FIRMWARE_TYPES = ["gateway", "node"] as const;
const VERSION_RE = /^\d+\.\d+\.\d+(-[0-9A-Za-z.]+)?$/;
const FILE_NAME_RE = /^[A-Za-z0-9._ -]+$/;

export interface UploadFirmwareInput {
  type: "gateway" | "node";
  version: string;
  stable: boolean;
  fileName: string;
  releaseNotes: string | null;
  data: Buffer;
}

export type UploadFirmwareQuery = Omit<UploadFirmwareInput, "data">;

export function parseUploadFirmwareQuery(query: Record<string, unknown>): UploadFirmwareQuery {
  const type = requireEnum(queryString(query.type), "type", FIRMWARE_TYPES);
  const version = requireString(queryString(query.version, 32), "version", { max: 32, pattern: VERSION_RE });
  const stable = optionalBool(queryString(query.stable), "stable") ?? false;
  const fileName =
    optionalString(queryString(query.file_name, 128), "file_name", { max: 128, pattern: FILE_NAME_RE }) ??
    `${type}-${version}.bin`;
  const releaseNotes = optionalString(queryString(query.release_notes, 500), "release_notes", { max: 500 }) ?? null;
  return { type, version, stable, fileName, releaseNotes };
}
