import type { Request, Response } from "express";
import { getAuth } from "../../../../core/auth/auth-context";
import { listOtaDeployments } from "./list-deployments.handler";

export async function listDeploymentsController(req: Request, res: Response): Promise<void> {
  res.json(await listOtaDeployments(getAuth(req)));
}
