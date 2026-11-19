import type { Request, Response } from "express";
import { getAuth } from "../../../../core/auth/auth-context";
import { requestMeta } from "../../../../core/http/request-meta";
import { parseCreateDeploymentBody } from "./create-deployment.dto";
import { createDeployment } from "./create-deployment.handler";

export async function createDeploymentController(req: Request, res: Response): Promise<void> {
  const body = (req.body ?? {}) as Record<string, unknown>;
  const created = await createDeployment(getAuth(req), parseCreateDeploymentBody(body), requestMeta(req));
  res.status(201).json(created);
}
