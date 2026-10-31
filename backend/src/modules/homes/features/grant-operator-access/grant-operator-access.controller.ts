// POST /api/dashboard/operator-access.
import type { Request, Response } from "express";
import { requestMeta } from "../../../../core/http/request-meta";
import { requireId, requireInt, requireString } from "../../../../shared/validation/validate";
import { getAuth } from "../../../../core/auth/auth-context";
import { grantAsAdmin } from "./grant-operator-access.handler";

export async function grantOperatorAccessController(req: Request, res: Response): Promise<void> {
  const auth = getAuth(req);
  const body = (req.body ?? {}) as Record<string, unknown>;
  const grant = await grantAsAdmin(
    auth,
    {
      operatorId: requireId(body.operator_id, "operator_id"),
      homeId: requireId(body.home_id, "home_id"),
      reason: requireString(body.reason, "reason", { min: 5, max: 255 }),
      durationHours: requireInt(body.duration_hours, "duration_hours", { min: 1, max: 72 }),
    },
    requestMeta(req)
  );
  res.status(201).json(grant);
}
