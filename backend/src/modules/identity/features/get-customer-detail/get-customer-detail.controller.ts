// GET /api/dashboard/customers/:id → CustomerDetail (404 nếu không có khách).
import type { Request, Response } from "express";
import { getAuth } from "../../../../core/auth/auth-context";
import { parseIdParam } from "../../../../shared/validation/validate";
import { getCustomerDetail } from "./get-customer-detail.handler";

export async function getCustomerDetailController(req: Request, res: Response): Promise<void> {
  res.json(await getCustomerDetail(getAuth(req), parseIdParam(req.params.id)));
}
