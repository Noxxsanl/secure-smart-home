// Đổi trạng thái quản trị thiết bị (active/inactive/blocked); active reset fail_count (mở khoá thiết bị bị chặn do sai HMAC).
import type { RequestMeta } from "../../../../core/http/request-meta";
import type { AuthContext } from "../../../../core/auth/auth-context";
import { eventBus } from "../../../../shared/events/event-bus";
import type { DeviceStatus } from "../../../../shared/types/domain";
import { logEvent } from "../../../audit";
import { notifyStaff } from "../../../notifications";
import { ensureHomeAccess, requireDevice } from "../../domain/console-access";
import type { ConsoleDevice } from "../../domain/device.types";
import { updateDeviceStatus } from "../../infrastructure/console-devices.repository";
import { toConsoleDevice, toDeviceStateEvent } from "../../infrastructure/device.read-model";

export async function setDeviceStatus(auth: AuthContext, id: number, status: DeviceStatus, meta: RequestMeta): Promise<ConsoleDevice> {
  const row = await requireDevice(id);
  // Chặn/mở khoá thiết bị của nhà đã claim là thao tác trên tài sản khách → Operator cần grant (ADMIN không bị hạn chế)
  await ensureHomeAccess(auth, { id: row.home_id, status: row.home_status });
  await updateDeviceStatus(id, status);

  await logEvent({
    eventType: "DEVICE_STATUS_CHANGE",
    deviceId: id,
    actorUserId: auth.userId,
    message: `${auth.username} đổi trạng thái thiết bị ${row.device_id} thành ${status}`,
    ip: meta.ip,
    userAgent: meta.userAgent,
    details: { device_uid: row.device_id, from: row.status, to: status },
  });

  // Như route cũ: thao tác của Operator được báo cho ADMIN
  if (auth.role === "operator") {
    const titles: Record<DeviceStatus, [string, string]> = {
      blocked: ["Thiết bị bị chặn", `Operator ${auth.username} đã chặn thiết bị ${row.device_id}`],
      active: ["Thiết bị được mở khoá", `Operator ${auth.username} đã bỏ chặn thiết bị ${row.device_id}`],
      inactive: ["Thiết bị bị vô hiệu hoá", `Operator ${auth.username} đã vô hiệu hoá thiết bị ${row.device_id}`],
    };
    const [title, message] = titles[status];
    await notifyStaff({
      targetRole: "admin",
      type: status === "blocked" ? "DEVICE_BLOCKED" : "DEVICE_STATUS_CHANGE",
      title,
      message,
      severity: status === "blocked" ? "warning" : "info",
      homeId: row.home_id,
      relatedDeviceId: id,
      actor: { id: auth.userId, username: auth.username, role: auth.role },
    });
  }

  const updated = await requireDevice(id);
  const event = toDeviceStateEvent(updated);
  if (event) eventBus.emit("device_state", event);
  return toConsoleDevice(updated);
}
