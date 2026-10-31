// POST /api/dashboard/smart-homes/:id/activation-codes.
import type { Request, Response } from "express";
import { requestMeta } from "../../../../core/http/request-meta";
import { parseIdParam } from "../../../../shared/validation/validate";
import { getAuth } from "../../../../core/auth/auth-context";
import { createActivationCode } from "./issue-activation-code.handler";

export async function issueActivationCodeController(req: Request, res: Response): Promise<void> {
  res.status(201).json(await createActivationCode(getAuth(req), parseIdParam(req.params.id), requestMeta(req)));
}
