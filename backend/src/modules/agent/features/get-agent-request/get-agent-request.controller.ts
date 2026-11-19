import type { Request, Response } from "express";
import { getAuth } from "../../../../core/auth/auth-context";
import { parseIdParam } from "../../../../shared/validation/validate";
import { getAgentRequestDetail } from "./get-agent-request.handler";

// GET /agent/requests/:requestId → 200 AgentRequestDetail (portal + mobile)
export async function getAgentRequestController(req: Request, res: Response): Promise<void> {
  res.json(await getAgentRequestDetail(getAuth(req), parseIdParam(req.params.requestId)));
}
