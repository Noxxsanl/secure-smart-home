// Bật/tắt nguồn thiết bị ảo. Tắt: ngừng heartbeat → thiết bị offline sau cửa sổ 90 s bình thường
// (worker deviceMonitor của module devices sẽ thông báo). Bật: heartbeat chạy ngay để lên online mà không chờ vòng 20 s.
import type { AuthContext } from "../../../../core/auth/auth-context";
import type { RequestMeta } from "../../../../core/http/request-meta";
import { notFound } from "../../../../shared/errors/http-error";
import { logEvent } from "../../../audit";
import { getDeviceRow, toConsoleDevice } from "../../../devices";
import type { ConsoleDevice, DeviceRow } from "../../../devices";
import { runSimulatedHeartbeat } from "../../domain/simulated-heartbeat";
import { setSimOnline } from "../../infrastructure/simulator.repository";

export async function simulateDevicePower(auth: AuthContext, device: DeviceRow, online: boolean, meta: RequestMeta): Promise<ConsoleDevice> {
  await setSimOnline(device.id, online);
  if (online) await runSimulatedHeartbeat();

  await logEvent({
    eventType: "DEVICE_STATUS_CHANGE",
    homeId: device.home_id,
    deviceId: device.id,
    actorUserId: auth.userId,
    message: `Giả lập: ${online ? "bật" : "tắt"} nguồn thiết bị "${device.device_name}"`,
    ip: meta.ip,
    userAgent: meta.userAgent,
    details: { simulated: true, sim_online: online },
  });

  const updated = await getDeviceRow(device.id);
  if (!updated) throw notFound("Device not found");
  return toConsoleDevice(updated);
}
