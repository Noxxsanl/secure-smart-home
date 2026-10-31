import type { Request, RequestHandler, Response } from "express";
import { requestMeta } from "../../../../core/http/request-meta";
import { getAuth } from "../../../../core/auth/auth-context";
import { parseIdParam } from "../../../../shared/validation/validate";
import type { GatewayAction } from "../../../devices";
import { commandGateway } from "./send-gateway-command.handler";

// POST /api/dashboard/gateways/:id/restart (action "restart") và /factory-reset (action "factory_reset") → 202 { command_id }
export function sendGatewayCommandController(action: GatewayAction): RequestHandler {
  return async (req: Request, res: Response): Promise<void> => {
    const result = await commandGateway(getAuth(req), parseIdParam(req.params.id), action, requestMeta(req));
    res.status(202).json(result);
  };
}
