import type { Request, Response } from "express";
import { getAuth } from "../../../../core/auth/auth-context";
import { parseIdParam } from "../../../../shared/validation/validate";
import { getConsoleDeviceDetail } from "./get-console-device-detail.handler";

// GET /api/dashboard/devices/:id
export async function getConsoleDeviceDetailController(req: Request, res: Response): Promise<void> {
  res.json(await getConsoleDeviceDetail(getAuth(req), parseIdParam(req.params.id)));
}
