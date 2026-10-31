// DELETE /api/dashboard/logs/:category  body { ids } → 204 (chỉ ADMIN).
import type { Request, Response } from "express";
import { getAuth } from "../../../../core/auth/auth-context";
import { requestMeta } from "../../../../core/http/request-meta";
import { requireIdList } from "../../../../shared/validation/validate";
import { parseCategory } from "../../domain/log-categories";
import { deleteLogs } from "./delete-logs.handler";

export async function deleteLogsController(req: Request, res: Response): Promise<void> {
  const auth = getAuth(req);
  const category = parseCategory(req.params.category);
  const body = (req.body ?? {}) as Record<string, unknown>;
  const ids = requireIdList(body.ids, "ids", { max: 500 });
  await deleteLogs(auth, category, ids, requestMeta(req));
  res.status(204).end();
}
