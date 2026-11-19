// GET /api/{portal|mobile}/notifications?home_id&limit → { notifications, unread_count } (FR-8.2, 8.4).
import type { Request, Response } from "express";
import { getAuth } from "../../../../core/auth/auth-context";
import { optionalId, parseLimit, queryString } from "../../../../shared/validation/validate";
import { listNotifications } from "./list-notifications.handler";

export async function listNotificationsController(req: Request, res: Response): Promise<void> {
  const auth = getAuth(req);
  const homeId = optionalId(queryString(req.query.home_id, 12), "home_id");
  const limit = parseLimit(req.query.limit, 50, 200);
  res.json(await listNotifications(auth, homeId, limit));
}
