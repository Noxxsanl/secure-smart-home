import type { Request, Response } from "express";
import { getAuth } from "../../../../core/auth/auth-context";
import { requestMeta } from "../../../../core/http/request-meta";
import { parseIdParam } from "../../../../shared/validation/validate";
import { deleteAutomation } from "./delete-automation.handler";

export async function deleteAutomationController(req: Request, res: Response): Promise<void> {
  await deleteAutomation(getAuth(req), parseIdParam(req.params.ruleId), requestMeta(req));
  res.status(204).end();
}
