import type { Request, Response } from "express";
import { getAuth } from "../../../../core/auth/auth-context";
import { optionalId, queryString } from "../../../../shared/validation/validate";
import { listAutomation } from "./list-console-automations.handler";

export async function listConsoleAutomationsController(req: Request, res: Response): Promise<void> {
  const homeId = optionalId(queryString(req.query.home_id), "home_id");
  res.json(await listAutomation(getAuth(req), homeId));
}
