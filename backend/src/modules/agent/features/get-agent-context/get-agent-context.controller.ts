import type { Request, Response } from "express";
import { getAuth } from "../../../../core/auth/auth-context";
import { parseIdParam } from "../../../../shared/validation/validate";
import { getAgentContext } from "./get-agent-context.handler";

// GET /api/service/agent/homes/:homeId/context → 200 AgentContext (sau requireServiceToken + requireActingUser)
export async function getAgentContextController(req: Request, res: Response): Promise<void> {
  res.json(await getAgentContext(getAuth(req), parseIdParam(req.params.homeId)));
}
