import type { Request, Response } from "express";
import { requestMeta } from "../../../../core/http/request-meta";
import { getAuth } from "../../../../core/auth/auth-context";
import { parseIdParam } from "../../../../shared/validation/validate";
import { removeDevice } from "./remove-device.handler";

// DELETE /api/dashboard/devices/:id (ADMIN)
export async function removeDeviceController(req: Request, res: Response): Promise<void> {
  await removeDevice(getAuth(req), parseIdParam(req.params.id), requestMeta(req));
  res.status(204).end();
}
