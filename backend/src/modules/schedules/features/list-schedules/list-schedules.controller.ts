import type { Request, Response } from "express";
import { getAuth } from "../../../../core/auth/auth-context";
import { parseIdParam, parseLimit, queryString, requireEnum } from "../../../../shared/validation/validate";
import type { ScheduleScope } from "../../domain/schedule.types";
import { listSchedules } from "./list-schedules.handler";

const SCOPES: readonly ScheduleScope[] = ["upcoming", "history"];

// GET /homes/:homeId/schedules?scope=upcoming|history&limit=1..100 → 200 { items: Schedule[] }
export async function listSchedulesController(req: Request, res: Response): Promise<void> {
  const rawScope = queryString(req.query.scope);
  const scope = rawScope === undefined ? "upcoming" : requireEnum(rawScope, "scope", SCOPES);
  const limit = parseLimit(req.query.limit, 50, 100);
  const items = await listSchedules(getAuth(req), parseIdParam(req.params.homeId), scope, limit);
  res.json({ items });
}
