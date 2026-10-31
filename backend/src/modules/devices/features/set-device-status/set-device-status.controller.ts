import type { Request, Response } from "express";
import { requestMeta } from "../../../../core/http/request-meta";
import { getAuth } from "../../../../core/auth/auth-context";
import { parseIdParam, requireEnum } from "../../../../shared/validation/validate";
import { DEVICE_STATUSES } from "../../../../shared/types/domain";
import { setDeviceStatus } from "./set-device-status.handler";

// PATCH /api/dashboard/devices/:id/status
export async function setDeviceStatusController(req: Request, res: Response): Promise<void> {
  const body = (req.body ?? {}) as Record<string, unknown>;
  const status = requireEnum(body.status, "status", DEVICE_STATUSES);
  res.json(await setDeviceStatus(getAuth(req), parseIdParam(req.params.id), status, requestMeta(req)));
}
