import type { Request, Response } from "express";
import { getAuth } from "../../../../core/auth/auth-context";
import { parseIdParam } from "../../../../shared/validation/validate";
import { listHomeSuggestions } from "./list-suggestions.handler";

export async function listSuggestionsController(req: Request, res: Response): Promise<void> {
  res.json(await listHomeSuggestions(getAuth(req), parseIdParam(req.params.homeId)));
}
