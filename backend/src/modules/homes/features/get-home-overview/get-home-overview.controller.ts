// GET /homes/:homeId/overview (portal + mobile).
import type { Request, Response } from "express";
import { parseIdParam } from "../../../../shared/validation/validate";
import { getAuth } from "../../../../core/auth/auth-context";
import { getOverview } from "./get-home-overview.handler";

export async function getHomeOverviewController(req: Request, res: Response): Promise<void> {
  res.json(await getOverview(getAuth(req), parseIdParam(req.params.homeId)));
}
