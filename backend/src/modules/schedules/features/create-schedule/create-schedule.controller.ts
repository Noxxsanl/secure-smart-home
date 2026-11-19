import type { Request, RequestHandler, Response } from "express";
import { getAuth } from "../../../../core/auth/auth-context";
import { requestMeta } from "../../../../core/http/request-meta";
import type { CustomerChannel } from "../../../../shared/types/domain";
import { parseIdParam } from "../../../../shared/validation/validate";
import { createSchedule } from "./create-schedule.handler";
import { parseScheduleBody } from "./create-schedule.dto";

// POST /homes/:homeId/schedules (portal: channel "web", mobile: channel "mobile") → 201 Schedule
export function createScheduleController(channel: CustomerChannel): RequestHandler {
  return async (req: Request, res: Response): Promise<void> => {
    const input = parseScheduleBody((req.body ?? {}) as Record<string, unknown>);
    const schedule = await createSchedule(getAuth(req), parseIdParam(req.params.homeId), input, channel, requestMeta(req));
    res.status(201).json(schedule);
  };
}
