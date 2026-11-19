import type { Request, RequestHandler, Response } from "express";
import { getAuth } from "../../../../core/auth/auth-context";
import { requestMeta } from "../../../../core/http/request-meta";
import type { CustomerChannel } from "../../../../shared/types/domain";
import { parseIdParam } from "../../../../shared/validation/validate";
import { parseConfirmBody } from "./confirm-agent-request.dto";
import { confirmAgentRequest } from "./confirm-agent-request.handler";

// POST /agent/requests/:requestId/confirm (portal: channel "web", mobile: "mobile") → 200 { request_id, status, results }
export function confirmAgentRequestController(channel: CustomerChannel): RequestHandler {
  return async (req: Request, res: Response): Promise<void> => {
    const input = parseConfirmBody((req.body ?? {}) as Record<string, unknown>);
    res.json(await confirmAgentRequest(getAuth(req), parseIdParam(req.params.requestId), input, channel, requestMeta(req)));
  };
}
