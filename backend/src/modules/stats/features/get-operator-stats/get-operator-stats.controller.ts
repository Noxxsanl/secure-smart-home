import type { Request, Response } from "express";
import { getAuth } from "../../../../core/auth/auth-context";
import { getOperatorStats } from "./get-operator-stats.handler";

/** Dashboard Operator: ADMIN cũng xem được (grant "của tôi" khi đó là rỗng). */
export async function getOperatorStatsController(req: Request, res: Response): Promise<void> {
  res.json(await getOperatorStats(getAuth(req)));
}
