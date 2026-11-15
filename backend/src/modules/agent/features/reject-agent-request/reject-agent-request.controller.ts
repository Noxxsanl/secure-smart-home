import type { Request, Response } from "express";
import { getAuth } from "../../../../core/auth/auth-context";
import { requestMeta } from "../../../../core/http/request-meta";
import { parseIdParam } from "../../../../shared/validation/validate";
import { rejectAgentRequest } from "./reject-agent-request.handler";

// POST /agent/requests/:requestId/reject → 200 { request_id, status: "rejected" }
export async function rejectAgentRequestController(req: Request, res: Response): Promise<void> {
  res.json(await rejectAgentRequest(getAuth(req), parseIdParam(req.params.requestId), requestMeta(req)));
}
