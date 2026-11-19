import type { Request, Response } from "express";
import { getAuth } from "../../../../core/auth/auth-context";
import { requestMeta } from "../../../../core/http/request-meta";
import { parseIdParam } from "../../../../shared/validation/validate";
import { cancelSchedule } from "./cancel-schedule.handler";

// POST /schedules/:scheduleId/cancel → 200 Schedule
export async function cancelScheduleController(req: Request, res: Response): Promise<void> {
  res.json(await cancelSchedule(getAuth(req), parseIdParam(req.params.scheduleId), requestMeta(req)));
}
