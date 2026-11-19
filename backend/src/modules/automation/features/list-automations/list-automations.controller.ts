import type { Request, Response } from "express";
import { getAuth } from "../../../../core/auth/auth-context";
import { parseIdParam } from "../../../../shared/validation/validate";
import { listAutomations } from "./list-automations.handler";

export async function listAutomationsController(req: Request, res: Response): Promise<void> {
  res.json(await listAutomations(getAuth(req), parseIdParam(req.params.homeId)));
}
