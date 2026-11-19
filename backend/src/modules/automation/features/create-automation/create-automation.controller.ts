import type { Request, Response } from "express";
import { getAuth } from "../../../../core/auth/auth-context";
import { requestMeta } from "../../../../core/http/request-meta";
import { parseIdParam } from "../../../../shared/validation/validate";
import { parseRuleBody } from "../../domain/rule-input.parser";
import { createAutomation } from "./create-automation.handler";

export async function createAutomationController(req: Request, res: Response): Promise<void> {
  const input = parseRuleBody((req.body ?? {}) as Record<string, unknown>);
  const rule = await createAutomation(getAuth(req), parseIdParam(req.params.homeId), input, requestMeta(req));
  res.status(201).json(rule);
}
