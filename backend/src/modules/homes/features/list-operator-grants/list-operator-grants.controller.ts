// GET /api/dashboard/operator-access.
import type { Request, Response } from "express";
import { getAuth } from "../../../../core/auth/auth-context";
import { listOperatorGrants } from "./list-operator-grants.handler";

export async function listOperatorGrantsController(req: Request, res: Response): Promise<void> {
  res.json(await listOperatorGrants(getAuth(req)));
}
