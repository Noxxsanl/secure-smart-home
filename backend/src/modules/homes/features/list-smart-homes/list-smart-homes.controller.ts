// GET /api/dashboard/smart-homes.
import type { Request, Response } from "express";
import { optionalEnum, queryString } from "../../../../shared/validation/validate";
import { HOME_STATUSES } from "../../../../shared/types/domain";
import { listSmartHomes } from "./list-smart-homes.handler";

export async function listSmartHomesController(req: Request, res: Response): Promise<void> {
  res.json(
    await listSmartHomes({
      status: optionalEnum(queryString(req.query.status), "status", HOME_STATUSES),
      q: queryString(req.query.q, 100),
    })
  );
}
