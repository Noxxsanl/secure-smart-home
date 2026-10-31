// POST /invitations/:id/accept (portal + mobile).
import type { Request, Response } from "express";
import { requestMeta } from "../../../../core/http/request-meta";
import { parseIdParam } from "../../../../shared/validation/validate";
import { getAuth } from "../../../../core/auth/auth-context";
import { acceptInvitation } from "./accept-invitation.handler";

export async function acceptInvitationController(req: Request, res: Response): Promise<void> {
  res.json(await acceptInvitation(getAuth(req), parseIdParam(req.params.id), requestMeta(req)));
}
