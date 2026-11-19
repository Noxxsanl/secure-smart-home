import type { Request, Response } from "express";
import { getAuth } from "../../../../core/auth/auth-context";
import { requestMeta } from "../../../../core/http/request-meta";
import { parseIdParam, requireBool } from "../../../../shared/validation/validate";
import { toggleAutomation } from "./toggle-automation.handler";

export async function toggleAutomationController(req: Request, res: Response): Promise<void> {
  const body = (req.body ?? {}) as Record<string, unknown>;
  const enabled = requireBool(body.enabled, "enabled");
  res.json(await toggleAutomation(getAuth(req), parseIdParam(req.params.id), enabled, requestMeta(req)));
}
