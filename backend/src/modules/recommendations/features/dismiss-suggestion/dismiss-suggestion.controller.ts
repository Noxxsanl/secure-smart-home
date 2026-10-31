import type { Request, Response } from "express";
import { getAuth } from "../../../../core/auth/auth-context";
import { requestMeta } from "../../../../core/http/request-meta";
import { optionalString, parseIdParam } from "../../../../shared/validation/validate";
import { dismissSuggestion } from "./dismiss-suggestion.handler";

export async function dismissSuggestionController(req: Request, res: Response): Promise<void> {
  const body = (req.body ?? {}) as Record<string, unknown>;
  const reason = optionalString(body.reason, "reason", { max: 255 }) ?? null;
  res.json(await dismissSuggestion(getAuth(req), parseIdParam(req.params.id), reason, requestMeta(req)));
}
