import type { Request, Response } from "express";
import { requireBool } from "../../../../shared/validation/validate";
import { loadSimulatedDevice } from "../../domain/simulated-device";
import { assertSimulatedDoorSensor, simulateDoor } from "./simulate-door.handler";

export async function simulateDoorController(req: Request, res: Response): Promise<void> {
  // Thứ tự giữ nguyên: thiết bị (404/409) được kiểm trước body (400)
  const device = await loadSimulatedDevice(req.params.id);
  const gatewayId = assertSimulatedDoorSensor(device);
  const open = requireBool((req.body as { open?: unknown } | undefined)?.open, "open");
  await simulateDoor(device.id, gatewayId, open);
  res.status(204).end();
}
