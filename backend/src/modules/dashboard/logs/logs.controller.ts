import type { Request, Response } from "express";
import { requestMeta } from "../../../lib/clientIp";
import {
  optionalEnum,
  optionalId,
  optionalIsoDate,
  parseLimit,
  parsePage,
  queryString,
  requireIdList,
} from "../../../lib/validate";
import { SEVERITIES } from "../../../types/domain";
import { getAuth } from "../../auth/authContext";
import { deleteLogs, getLogs, parseCategory } from "./logs.service";

export async function listLogsHandler(req: Request, res: Response): Promise<void> {
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

export async function deleteLogsHandler(req: Request, res: Response): Promise<void> {
  const auth = getAuth(req);
  const category = parseCategory(req.params.category);
  const body = (req.body ?? {}) as Record<string, unknown>;
  const ids = requireIdList(body.ids, "ids", { max: 500 });
  await deleteLogs(auth, category, ids, requestMeta(req));
  res.status(204).end();
}
