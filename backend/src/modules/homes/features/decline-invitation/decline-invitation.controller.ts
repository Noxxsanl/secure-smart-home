// POST /invitations/:id/decline (portal + mobile).
import type { Request, Response } from "express";
import { requestMeta } from "../../../../core/http/request-meta";
import { parseIdParam } from "../../../../shared/validation/validate";
import { getAuth } from "../../../../core/auth/auth-context";
import { declineInvitation } from "./decline-invitation.handler";

export async function declineInvitationController(req: Request, res: Response): Promise<void> {
  await declineInvitation(getAuth(req), parseIdParam(req.params.id), requestMeta(req));
  res.status(204).end();
}
