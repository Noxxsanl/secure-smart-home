// GET /api/dashboard/notifications?limit → { notifications, unread_count } (FR-8.5).
import type { Request, Response } from "express";
import { getAuth } from "../../../../core/auth/auth-context";
import { parseLimit } from "../../../../shared/validation/validate";
import { listStaffNotifications } from "./list-staff-notifications.handler";

export async function listStaffNotificationsController(req: Request, res: Response): Promise<void> {
  res.json(await listStaffNotifications(getAuth(req), parseLimit(req.query.limit, 50, 200)));
}
