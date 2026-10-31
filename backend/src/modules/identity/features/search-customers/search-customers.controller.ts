// GET /api/dashboard/customers?q → Customer[] (ADMIN thấy đủ liên hệ; Operator chỉ khách thuộc nhà có grant còn hạn).
import type { Request, Response } from "express";
import { getAuth } from "../../../../core/auth/auth-context";
import { queryString } from "../../../../shared/validation/validate";
import { searchCustomers } from "./search-customers.handler";

export async function searchCustomersController(req: Request, res: Response): Promise<void> {
  res.json(await searchCustomers(getAuth(req), queryString(req.query.q, 100)));
}
