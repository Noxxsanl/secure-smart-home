import type { Request, RequestHandler, Response } from "express";
import { requestMeta } from "../../../../core/http/request-meta";
import { getAuth } from "../../../../core/auth/auth-context";
import { parseIdParam, requireEnum } from "../../../../shared/validation/validate";
import type { CustomerChannel } from "../../../../shared/types/domain";
import type { DeviceAction } from "../../../devices";
import { commandDevice } from "./send-device-command.handler";

const ACTIONS: readonly DeviceAction[] = ["turn_on", "turn_off"];

// POST /devices/:deviceId/commands (portal: channel "web", mobile: channel "mobile")
export function sendDeviceCommandController(channel: CustomerChannel): RequestHandler {
  return async (req: Request, res: Response): Promise<void> => {
    const body = (req.body ?? {}) as Record<string, unknown>;
    const action = requireEnum(body.action, "action", ACTIONS);
    res.json(await commandDevice(getAuth(req), parseIdParam(req.params.deviceId), action, channel, requestMeta(req)));
  };
}
