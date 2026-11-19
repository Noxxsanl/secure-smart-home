import { dashApi, dashPath, revalidateDashboard } from "@shh/api-client/dashboard";
import type { CreateDeploymentInput, FirmwareVersion, OtaDeployment, UploadFirmwareInput } from "@shh/api-client/dashboard";

// §5 OTA (FR-9.3, FR-9.4).

export const FIRMWARE_MAX_BYTES = 4 * 1024 * 1024;
export const FIRMWARE_VERSION_PATTERN = /^\d+\.\d+\.\d+(-[0-9A-Za-z.]+)?$/;

export function firmwareKey() {
  return dashPath("/firmware");
}

export function deploymentsKey() {
  return dashPath("/ota/deployments");
}

/** Sau khi upload/đổi stable/deploy/rollback: tải lại firmware, deployment và badge sidebar. */
export function revalidateOtaData() {
  return revalidateDashboard("/firmware", "/ota", "/stats");
}

/**
 * Chỉ Admin. Body là nhị phân thô của file .bin (`application/octet-stream`),
 * metadata đi trên query string; server tự tính SHA-256.
 */
export function uploadFirmware(input: UploadFirmwareInput) {
  return dashApi<FirmwareVersion>("/firmware", {
    method: "POST",
    query: {
      type: input.type,
      version: input.version,
      stable: input.stable ? 1 : 0,
      file_name: input.file.name,
      release_notes: input.release_notes?.trim() || undefined,
    },
    rawBody: input.file,
    headers: { "Content-Type": "application/octet-stream" },
  });
}

/** Chỉ Admin. */
export function setFirmwareStable(id: number, stable: boolean) {
  return dashApi<FirmwareVersion>(`/firmware/${id}`, { method: "PATCH", body: { stable } });
}

/** Admin: mọi phạm vi; Operator: chỉ theo nhà (nhà chưa kích hoạt hoặc có quyền truy cập). */
export function createDeployment(input: CreateDeploymentInput) {
  return dashApi<OtaDeployment>("/ota/deployments", { method: "POST", body: input });
}

export function rollbackDeployment(id: number) {
  return dashApi<OtaDeployment>(`/ota/deployments/${id}/rollback`, { method: "POST" });
}
