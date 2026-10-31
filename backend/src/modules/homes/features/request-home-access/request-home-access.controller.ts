// POST /api/dashboard/smart-homes/:id/access-requests.
import type { Request, Response } from "express";
import { requestMeta } from "../../../../core/http/request-meta";
import { parseIdParam, requireInt, requireString } from "../../../../shared/validation/validate";
import { getAuth } from "../../../../core/auth/auth-context";
import { requestHomeAccess } from "./request-home-access.handler";

export async function requestHomeAccessController(req: Request, res: Response): Promise<void> {
  const body = (req.body ?? {}) as Record<string, unknown>;
  const grant = await requestHomeAccess(
    getAuth(req),
    parseIdParam(req.params.id),
    {
      reason: requireString(body.reason, "reason", { min: 5, max: 255 }),
      durationHours: requireInt(body.duration_hours, "duration_hours", { min: 1, max: 24 }),
    },
    requestMeta(req)
  );
  res.status(201).json(grant);
}
