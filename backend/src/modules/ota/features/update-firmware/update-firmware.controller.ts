import type { Request, Response } from "express";
import { getAuth } from "../../../../core/auth/auth-context";
import { requestMeta } from "../../../../core/http/request-meta";
import { parseIdParam, requireBool } from "../../../../shared/validation/validate";
import { updateFirmwareStable } from "./update-firmware.handler";

export async function updateFirmwareController(req: Request, res: Response): Promise<void> {
  const body = (req.body ?? {}) as Record<string, unknown>;
  const stable = requireBool(body.stable, "stable");
  res.json(await updateFirmwareStable(getAuth(req), parseIdParam(req.params.id), stable, requestMeta(req)));
}
