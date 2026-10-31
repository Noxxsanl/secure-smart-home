import type { Request, Response } from "express";
import { requestMeta } from "../../../../core/http/request-meta";
import { getAuth } from "../../../../core/auth/auth-context";
import { parseIdParam, requireString } from "../../../../shared/validation/validate";
import { renameDevice } from "./rename-device.handler";

// PATCH /devices/:deviceId (portal + mobile)
export async function renameDeviceController(req: Request, res: Response): Promise<void> {
  const body = (req.body ?? {}) as Record<string, unknown>;
  const name = requireString(body.device_name, "device_name", { max: 128 });
  res.json(await renameDevice(getAuth(req), parseIdParam(req.params.deviceId), name, requestMeta(req)));
}
