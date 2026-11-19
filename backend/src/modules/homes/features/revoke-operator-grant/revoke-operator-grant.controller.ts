// POST /api/dashboard/operator-access/:id/revoke.
import type { Request, Response } from "express";
import { requestMeta } from "../../../../core/http/request-meta";
import { parseIdParam } from "../../../../shared/validation/validate";
import { getAuth } from "../../../../core/auth/auth-context";
import { revokeGrant } from "./revoke-operator-grant.handler";

export async function revokeOperatorGrantController(req: Request, res: Response): Promise<void> {
  const grant = await revokeGrant(getAuth(req), parseIdParam(req.params.id), requestMeta(req));
  res.json(grant);
}
