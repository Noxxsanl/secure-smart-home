// Router /api/dashboard/simulator (đã nằm sau requireDashboard("admin", "operator") ở routes/index.ts).
// Công cụ demo: bật/tắt nguồn thiết bị ảo và "mở cửa" cho cảm biến cửa ảo. Chỉ tác động dòng is_simulated=1.
import { Router } from "express";
import { env } from "../../config/env";
import { runSql } from "../../lib/db";
import { requestMeta } from "../../lib/clientIp";
import { HttpError, notFound } from "../../lib/http";
import { parseIdParam, requireBool } from "../../lib/validate";
import { getAuth } from "../auth/authContext";
import { getDeviceRow, toConsoleDevice } from "../devices/deviceReadModel";
import type { DeviceRow } from "../devices/devices.types";
import { logEvent } from "../logs/logEvent";
import { ingestSimulatedReading, runSimulatedHeartbeat } from "./simulator";

async function loadSimulatedDevice(rawId: unknown): Promise<DeviceRow> {
  const device = await getDeviceRow(parseIdParam(rawId));
  if (!device) throw notFound("Device not found");
  if (!device.is_simulated) throw new HttpError(409, "NOT_SIMULATED", "Device is not simulated");
  if (!env.deviceSimulator) throw new HttpError(409, "SIMULATOR_DISABLED", "Device simulator is disabled");
  return device;
}

export function createSimulatorRouter(): Router {
  const router = Router();

  router.get("/status", (_req, res) => {
    res.json({ enabled: env.deviceSimulator });
  });

  // Bật/tắt nguồn thiết bị ảo. Tắt: ngừng heartbeat → thiết bị offline sau cửa sổ 90 s bình thường
  // (deviceMonitor sẽ thông báo). Bật: heartbeat chạy ngay để lên online mà không chờ vòng 20 s.
  router.post("/devices/:id/power", async (req, res) => {
    const device = await loadSimulatedDevice(req.params.id);
    const online = requireBool((req.body as { online?: unknown } | undefined)?.online, "online");

    await runSql("UPDATE devices SET sim_online = ? WHERE id = ? AND is_simulated = TRUE", [online, device.id]);
    if (online) await runSimulatedHeartbeat();

    const meta = requestMeta(req);
    await logEvent({
      eventType: "DEVICE_STATUS_CHANGE",
      homeId: device.home_id,
      deviceId: device.id,
      actorUserId: getAuth(req).userId,
      message: `Giả lập: ${online ? "bật" : "tắt"} nguồn thiết bị "${device.device_name}"`,
      ip: meta.ip,
      userAgent: meta.userAgent,
      details: { simulated: true, sim_online: online },
    });

    const updated = await getDeviceRow(device.id);
    if (!updated) throw notFound("Device not found");
    res.json(toConsoleDevice(updated));
  });

  // Cảm biến cửa ảo: đẩy một số đo { door_open } qua đúng hook như thiết bị thật
  // (mở cửa → thông báo DOOR_OPENED cho thành viên nhà).
  router.post("/devices/:id/door", async (req, res) => {
    const device = await loadSimulatedDevice(req.params.id);
    if (device.category !== "door_contact") throw new HttpError(409, "NOT_SIMULATED", "Device is not a simulated door sensor");
    if (device.gateway_device_id === null) throw new HttpError(409, "NO_GATEWAY", "Device has no gateway");
    if (!device.sim_online) throw new HttpError(409, "DEVICE_OFFLINE", "Simulated device is powered off");
    const open = requireBool((req.body as { open?: unknown } | undefined)?.open, "open");

    await ingestSimulatedReading(device.id, device.gateway_device_id, { door_open: open });
    res.status(204).end();
  });

  return router;
}
