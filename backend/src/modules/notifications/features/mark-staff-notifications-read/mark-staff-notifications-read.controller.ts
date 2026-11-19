// PATCH /api/dashboard/notifications/read-all → 204
// PATCH /api/dashboard/notifications/:id/read → 204 (404 nếu thuộc vai trò khác hoặc của khách)
import type { Request, Response } from "express";
import { getAuth } from "../../../../core/auth/auth-context";
import { parseIdParam } from "../../../../shared/validation/validate";
import { readAllStaffNotifications, readStaffNotification } from "./mark-staff-notifications-read.handler";

export async function markStaffNotificationReadController(req: Request, res: Response): Promise<void> {
  await readStaffNotification(getAuth(req), parseIdParam(req.params.id));
  res.status(204).end();
}

export async function markAllStaffNotificationsReadController(req: Request, res: Response): Promise<void> {
  await readAllStaffNotifications(getAuth(req));
  res.status(204).end();
}
