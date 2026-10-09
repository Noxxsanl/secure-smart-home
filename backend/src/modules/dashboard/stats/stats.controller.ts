import type { Request, Response } from "express";
import { getAuth } from "../../auth/authContext";
import { requireAdmin } from "../common/staff";
import { getAdminStats, getBadges, getOperatorStats } from "./stats.service";

export async function badgesHandler(req: Request, res: Response): Promise<void> {
  res.json(await getBadges(getAuth(req)));
}

/** Dashboard Operator: ADMIN cũng xem được (grant "của tôi" khi đó là rỗng). */
export async function operatorStatsHandler(req: Request, res: Response): Promise<void> {
  res.json(await getOperatorStats(getAuth(req)));
}

export async function adminStatsHandler(req: Request, res: Response): Promise<void> {
  requireAdmin(getAuth(req));
  res.json(await getAdminStats());
}
