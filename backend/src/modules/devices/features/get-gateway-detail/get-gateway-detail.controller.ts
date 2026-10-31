import type { Request, Response } from "express";
import { getAuth } from "../../../../core/auth/auth-context";
import { parseIdParam } from "../../../../shared/validation/validate";
import { getGatewayDetail } from "./get-gateway-detail.handler";

// GET /api/dashboard/gateways/:id
export async function getGatewayDetailController(req: Request, res: Response): Promise<void> {
  res.json(await getGatewayDetail(getAuth(req), parseIdParam(req.params.id)));
}
