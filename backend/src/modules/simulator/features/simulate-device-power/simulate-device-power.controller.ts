import type { Request, Response } from "express";
import { getAuth } from "../../../../core/auth/auth-context";
import { requestMeta } from "../../../../core/http/request-meta";
import { requireBool } from "../../../../shared/validation/validate";
import { loadSimulatedDevice } from "../../domain/simulated-device";
import { simulateDevicePower } from "./simulate-device-power.handler";

export async function simulateDevicePowerController(req: Request, res: Response): Promise<void> {
  // Thứ tự giữ nguyên: thiết bị (404/409) được kiểm trước body (400)
  const device = await loadSimulatedDevice(req.params.id);
  const online = requireBool((req.body as { online?: unknown } | undefined)?.online, "online");
  res.json(await simulateDevicePower(getAuth(req), device, online, requestMeta(req)));
}
