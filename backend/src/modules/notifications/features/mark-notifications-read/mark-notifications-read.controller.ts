// PATCH /api/{portal|mobile}/notifications/read-all  body { home_id? } → 204
// PATCH /api/{portal|mobile}/notifications/:id/read → 204 (404 nếu không phải thông báo của mình)
import type { Request, Response } from "express";
import { getAuth } from "../../../../core/auth/auth-context";
import { optionalId, parseIdParam } from "../../../../shared/validation/validate";
import { markAllNotificationsRead, markNotificationRead } from "./mark-notifications-read.handler";

export async function markAllNotificationsReadController(req: Request, res: Response): Promise<void> {
  const body = (req.body ?? {}) as Record<string, unknown>;
  await markAllNotificationsRead(getAuth(req), optionalId(body.home_id, "home_id"));
  res.status(204).end();
}

export async function markNotificationReadController(req: Request, res: Response): Promise<void> {
  const auth = getAuth(req);
  await markNotificationRead(auth, parseIdParam(req.params.id));
  res.status(204).end();
}
