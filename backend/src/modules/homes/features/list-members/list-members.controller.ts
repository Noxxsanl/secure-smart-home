// GET /homes/:homeId/members (portal + mobile).
import type { Request, Response } from "express";
import { parseIdParam } from "../../../../shared/validation/validate";
import { getAuth } from "../../../../core/auth/auth-context";
import { listMembers } from "./list-members.handler";

export async function listMembersController(req: Request, res: Response): Promise<void> {
  res.json(await listMembers(getAuth(req), parseIdParam(req.params.homeId)));
}
