// POST /api/dashboard/smart-homes/:id/activation-codes/revoke.
import type { Request, Response } from "express";
import { requestMeta } from "../../../../core/http/request-meta";
import { parseIdParam } from "../../../../shared/validation/validate";
import { getAuth } from "../../../../core/auth/auth-context";
import { revokeActivation } from "./revoke-activation-codes.handler";

export async function revokeActivationCodesController(req: Request, res: Response): Promise<void> {
  await revokeActivation(getAuth(req), parseIdParam(req.params.id), requestMeta(req));
  res.status(204).end();
}
