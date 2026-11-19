// GET /api/dashboard/logs/:category — Log Center (ADMIN: mọi category, Operator: 5 category vận hành).
import type { Request, Response } from "express";
import { getAuth } from "../../../../core/auth/auth-context";
import { SEVERITIES } from "../../../../shared/types/domain";
import {
  optionalEnum,
  optionalId,
  optionalIsoDate,
  parseLimit,
  parsePage,
  queryString,
} from "../../../../shared/validation/validate";
import { parseCategory } from "../../domain/log-categories";
import { getLogs } from "./list-logs.handler";

export async function listLogsController(req: Request, res: Response): Promise<void> {
  const auth = getAuth(req);
  const category = parseCategory(req.params.category);
  const page = parsePage(req.query.page);
  const limit = parseLimit(req.query.limit, 50, 200);
  const result = await getLogs(
    auth,
    category,
    {
      homeId: optionalId(queryString(req.query.home_id), "home_id"),
      severity: optionalEnum(queryString(req.query.severity), "severity", SEVERITIES),
      from: optionalIsoDate(queryString(req.query.from), "from"),
      to: optionalIsoDate(queryString(req.query.to), "to"),
      actor: queryString(req.query.actor, 64),
      q: queryString(req.query.q, 100),
    },
    page,
    limit
  );
  res.json(result);
}
