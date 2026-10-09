import type { Request, Response } from "express";
import { parseIdParam, queryString } from "../../../lib/validate";
import { getAuth } from "../../auth/authContext";
import { getCustomerDetail, searchCustomers } from "./customers.service";

export async function listCustomersHandler(req: Request, res: Response): Promise<void> {
  res.json(await searchCustomers(getAuth(req), queryString(req.query.q, 100)));
}

export async function customerDetailHandler(req: Request, res: Response): Promise<void> {
  res.json(await getCustomerDetail(getAuth(req), parseIdParam(req.params.id)));
}
