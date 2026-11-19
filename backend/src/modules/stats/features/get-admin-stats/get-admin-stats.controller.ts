import type { Request, Response } from "express";
import { getAuth } from "../../../../core/auth/auth-context";
import { requireAdmin } from "../../../../core/auth/roles";
import { getAdminStats } from "./get-admin-stats.handler";

export async function getAdminStatsController(req: Request, res: Response): Promise<void> {
  requireAdmin(getAuth(req));
  res.json(await getAdminStats());
}
