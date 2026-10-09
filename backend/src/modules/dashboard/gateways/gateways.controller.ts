import type { Request, Response } from "express";
import { requestMeta } from "../../../lib/clientIp";
import { parseIdParam } from "../../../lib/validate";
import { getAuth } from "../../auth/authContext";
import type { GatewayAction } from "../../devices/devices.types";
import { commandGateway, getGatewayDetail, listGateways } from "./gateways.service";

export async function listGatewaysHandler(_req: Request, res: Response): Promise<void> {
  res.json(await listGateways());
}

export async function gatewayDetailHandler(req: Request, res: Response): Promise<void> {
  res.json(await getGatewayDetail(getAuth(req), parseIdParam(req.params.id)));
}

function commandHandler(action: GatewayAction) {
  return async (req: Request, res: Response): Promise<void> => {
    const result = await commandGateway(getAuth(req), parseIdParam(req.params.id), action, requestMeta(req));
    res.status(202).json(result);
  };
}

export const restartHandler = commandHandler("restart");
export const factoryResetHandler = commandHandler("factory_reset");
