// POST /homes/:homeId/leave (portal + mobile).
import type { Request, Response } from "express";
import { requestMeta } from "../../../../core/http/request-meta";
import { parseIdParam } from "../../../../shared/validation/validate";
import { getAuth } from "../../../../core/auth/auth-context";
import { leaveHome } from "./leave-home.handler";

export async function leaveHomeController(req: Request, res: Response): Promise<void> {
  await leaveHome(getAuth(req), parseIdParam(req.params.homeId), requestMeta(req));
  res.status(204).end();
}
