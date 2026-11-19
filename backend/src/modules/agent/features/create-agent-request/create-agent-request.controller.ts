import type { Request, Response } from "express";
import { getAuth } from "../../../../core/auth/auth-context";
import { requestMeta } from "../../../../core/http/request-meta";
import { parseIdParam } from "../../../../shared/validation/validate";
import { parseCreateAgentRequestBody } from "./create-agent-request.dto";
import { createAgentRequest } from "./create-agent-request.handler";

// POST /api/service/agent/homes/:homeId/requests → 201 { request_id, status, executed, scheduled, pending, rejected }
// (sau requireServiceToken + requireActingUser). Body chứa câu nói của người dùng: KHÔNG log body.
export async function createAgentRequestController(req: Request, res: Response): Promise<void> {
  const input = parseCreateAgentRequestBody((req.body ?? {}) as Record<string, unknown>);
  const result = await createAgentRequest(getAuth(req), parseIdParam(req.params.homeId), input, requestMeta(req));
  res.status(201).json(result);
}
