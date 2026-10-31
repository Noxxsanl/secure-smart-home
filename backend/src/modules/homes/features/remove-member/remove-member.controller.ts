// DELETE /members/:memberId (portal + mobile).
import type { Request, Response } from "express";
import { requestMeta } from "../../../../core/http/request-meta";
import { parseIdParam } from "../../../../shared/validation/validate";
import { getAuth } from "../../../../core/auth/auth-context";
import { removeMember } from "./remove-member.handler";

export async function removeMemberController(req: Request, res: Response): Promise<void> {
  await removeMember(getAuth(req), parseIdParam(req.params.memberId), requestMeta(req));
  res.status(204).end();
}
