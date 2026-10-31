import type { Request, Response } from "express";
import { getAuth } from "../../../../core/auth/auth-context";
import { requestMeta } from "../../../../core/http/request-meta";
import { parseIdParam } from "../../../../shared/validation/validate";
import { parseRuleBody } from "../../domain/rule-input.parser";
import { patchAutomation } from "./update-automation.handler";

export async function updateAutomationController(req: Request, res: Response): Promise<void> {
  const input = parseRuleBody((req.body ?? {}) as Record<string, unknown>);
  res.json(await patchAutomation(getAuth(req), parseIdParam(req.params.ruleId), input, requestMeta(req)));
}
