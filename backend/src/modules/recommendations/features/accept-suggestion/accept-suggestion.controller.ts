import type { Request, Response } from "express";
import { getAuth } from "../../../../core/auth/auth-context";
import { requestMeta } from "../../../../core/http/request-meta";
import { parseIdParam } from "../../../../shared/validation/validate";
import { acceptSuggestion } from "./accept-suggestion.handler";

export async function acceptSuggestionController(req: Request, res: Response): Promise<void> {
  res.json(await acceptSuggestion(getAuth(req), parseIdParam(req.params.id), requestMeta(req)));
}
