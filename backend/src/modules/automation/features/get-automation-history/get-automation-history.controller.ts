import type { Request, Response } from "express";
import { getAuth } from "../../../../core/auth/auth-context";
import { parseIdParam, parseLimit } from "../../../../shared/validation/validate";
import { getAutomationHistory } from "./get-automation-history.handler";

export async function getAutomationHistoryController(req: Request, res: Response): Promise<void> {
  res.json(await getAutomationHistory(getAuth(req), parseIdParam(req.params.ruleId), parseLimit(req.query.limit, 20, 100)));
}
