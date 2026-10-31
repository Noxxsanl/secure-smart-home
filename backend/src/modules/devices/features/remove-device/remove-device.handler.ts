// Xoá thiết bị (chỉ ADMIN). FK ON DELETE CASCADE dọn sensor_data, device_tokens, ota_history, device_commands…
import type { RequestMeta } from "../../../../core/http/request-meta";
import type { AuthContext } from "../../../../core/auth/auth-context";
import { requireAdmin } from "../../../../core/auth/roles";
import { eventBus } from "../../../../shared/events/event-bus";
import { logEvent } from "../../../audit";
import { requireDevice } from "../../domain/console-access";
import { deleteDeviceRow } from "../../infrastructure/console-devices.repository";

export async function removeDevice(auth: AuthContext, id: number, meta: RequestMeta): Promise<void> {
  requireAdmin(auth);
  const row = await requireDevice(id);
  await deleteDeviceRow(id);
  await logEvent({
    eventType: "DEVICE_DELETE",
    homeId: row.home_id,
    actorUserId: auth.userId,
    message: `${auth.username} xoá thiết bị ${row.device_id} (${row.device_name})`,
    ip: meta.ip,
    userAgent: meta.userAgent,
    details: { device_uid: row.device_id, category: row.category },
  });
  if (row.home_id !== null) eventBus.emit("home_changed", { home_id: row.home_id });
}
