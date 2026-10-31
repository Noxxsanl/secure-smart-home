// GET /api/dashboard/smart-homes/:id.
import type { Request, Response } from "express";
import { requestMeta } from "../../../../core/http/request-meta";
import { parseIdParam } from "../../../../shared/validation/validate";
import { getAuth } from "../../../../core/auth/auth-context";
import { getSmartHomeDetail } from "./get-smart-home-detail.handler";

export async function getSmartHomeDetailController(req: Request, res: Response): Promise<void> {
  res.json(await getSmartHomeDetail(getAuth(req), parseIdParam(req.params.id), requestMeta(req)));
}
