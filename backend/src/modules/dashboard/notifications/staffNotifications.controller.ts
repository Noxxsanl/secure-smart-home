import type { Request, Response } from "express";
import { parseIdParam, parseLimit } from "../../../lib/validate";
import { getAuth } from "../../auth/authContext";
import { listStaffNotifications, readAllStaffNotifications, readStaffNotification } from "./staffNotifications.service";

export async function listHandler(req: Request, res: Response): Promise<void> {
  res.json(await listStaffNotifications(getAuth(req), parseLimit(req.query.limit, 50, 200)));
}

export async function readOneHandler(req: Request, res: Response): Promise<void> {
  await readStaffNotification(getAuth(req), parseIdParam(req.params.id));
  res.status(204).end();
}

export async function readAllHandler(req: Request, res: Response): Promise<void> {
  await readAllStaffNotifications(getAuth(req));
  res.status(204).end();
}
