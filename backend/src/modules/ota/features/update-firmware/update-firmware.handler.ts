// Đánh dấu / bỏ đánh dấu firmware là bản ổn định (FR-9.3) — chỉ ADMIN.
import type { AuthContext } from "../../../../core/auth/auth-context";
import type { RequestMeta } from "../../../../core/http/request-meta";
import { requireAdmin } from "../../../../core/auth/roles";
import { notFound } from "../../../../shared/errors/http-error";
import { logEvent } from "../../../audit";
import type { FirmwareVersion } from "../../domain/ota.types";
import { getFirmware } from "../../infrastructure/firmware.read-model";
import { setFirmwareStable } from "../../infrastructure/firmware.repository";

export async function updateFirmwareStable(auth: AuthContext, id: number, stable: boolean, meta: RequestMeta): Promise<FirmwareVersion> {
  requireAdmin(auth);
  const firmware = await getFirmware(id);
  if (!firmware) throw notFound("Firmware not found");
  await setFirmwareStable(id, stable);
  await logEvent({
    eventType: "FIRMWARE_STABLE_CHANGED",
    category: "ota", // sự kiện ngoài catalog: khai báo tường minh để không rơi vào category "error"
    severity: "info",
    actorUserId: auth.userId,
    message: `${auth.username} ${stable ? "đánh dấu" : "bỏ đánh dấu"} firmware ${firmware.type} ${firmware.version} là bản ổn định`,
    ip: meta.ip,
    userAgent: meta.userAgent,
    details: { firmware_id: id, stable },
  });
  const updated = await getFirmware(id);
  if (!updated) throw notFound("Firmware not found");
  return updated;
}
