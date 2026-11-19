import type { Request, Response } from "express";
import { getAuth } from "../../../../core/auth/auth-context";
import { parseIdParam } from "../../../../shared/validation/validate";
import { getDeviceDetail } from "./get-device-detail.handler";

// GET /devices/:deviceId (portal + mobile)
export async function getDeviceDetailController(req: Request, res: Response): Promise<void> {
  res.json(await getDeviceDetail(getAuth(req), parseIdParam(req.params.deviceId)));
}
