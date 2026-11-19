// GET /invitations (portal + mobile).
import type { Request, Response } from "express";
import { getAuth } from "../../../../core/auth/auth-context";
import { listMyInvitations } from "./list-invitations.handler";

export async function listInvitationsController(req: Request, res: Response): Promise<void> {
  res.json(await listMyInvitations(getAuth(req)));
}
