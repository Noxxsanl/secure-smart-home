import type { Request, Response } from "express";
import { listGateways } from "./list-gateways.handler";

// GET /api/dashboard/gateways
export async function listGatewaysController(_req: Request, res: Response): Promise<void> {
  res.json(await listGateways());
}
