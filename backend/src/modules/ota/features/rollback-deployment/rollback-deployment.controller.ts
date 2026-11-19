import type { Request, Response } from "express";
import { getAuth } from "../../../../core/auth/auth-context";
import { requestMeta } from "../../../../core/http/request-meta";
import { parseIdParam } from "../../../../shared/validation/validate";
import { rollbackDeployment } from "./rollback-deployment.handler";

export async function rollbackDeploymentController(req: Request, res: Response): Promise<void> {
  res.json(await rollbackDeployment(getAuth(req), parseIdParam(req.params.id), requestMeta(req)));
}
