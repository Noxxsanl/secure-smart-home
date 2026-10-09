import type { Request, Response } from "express";
import { requestMeta } from "../../../lib/clientIp";
import { parseIdParam, requireId, requireInt, requireString } from "../../../lib/validate";
import { getAuth } from "../../auth/authContext";
import { grantAsAdmin, listOperatorGrants, revokeGrant } from "./operatorAccess.service";

export async function listGrantsHandler(req: Request, res: Response): Promise<void> {
  res.json(await listOperatorGrants(getAuth(req)));
}

export async function createGrantHandler(req: Request, res: Response): Promise<void> {
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

export async function revokeGrantHandler(req: Request, res: Response): Promise<void> {
  const grant = await revokeGrant(getAuth(req), parseIdParam(req.params.id), requestMeta(req));
  res.json(grant);
}
