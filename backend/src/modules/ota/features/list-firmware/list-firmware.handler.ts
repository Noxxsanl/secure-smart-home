// Danh sách phiên bản firmware (FR-9.3).
import type { FirmwareVersion } from "../../domain/ota.types";
import { listFirmware } from "../../infrastructure/firmware.read-model";

export async function listFirmwareVersions(): Promise<FirmwareVersion[]> {
  return listFirmware();
}
