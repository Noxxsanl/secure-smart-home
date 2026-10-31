// POST /api/dashboard/smart-homes/:id/assign-owner.
import type { Request, Response } from "express";
import { requestMeta } from "../../../../core/http/request-meta";
import { HttpError } from "../../../../shared/errors/http-error";
import { isBlank, optionalId, parseIdParam, requireString } from "../../../../shared/validation/validate";
import { getAuth } from "../../../../core/auth/auth-context";
import { assignHomeOwner } from "./assign-owner.handler";

export async function assignOwnerController(req: Request, res: Response): Promise<void> {
  const body = (req.body ?? {}) as Record<string, unknown>;
  const customerId = optionalId(body.customer_id, "customer_id");
  const userTag = isBlank(body.user_tag) ? undefined : requireString(body.user_tag, "user_tag", { max: 32 });
  if (customerId === undefined && userTag === undefined) {
    throw new HttpError(400, "MISSING_FIELDS", "user_tag or customer_id is required");
  }
  res.json(await assignHomeOwner(getAuth(req), parseIdParam(req.params.id), { userTag, customerId }, requestMeta(req)));
}
