import type { Request, Response } from "express";
import { requestMeta } from "../../../lib/clientIp";
import { optionalId, parseIdParam, queryString, requireBool } from "../../../lib/validate";
import { getAuth } from "../../auth/authContext";
import { listAutomation, toggleAutomation } from "./automation.service";

export async function listAutomationHandler(req: Request, res: Response): Promise<void> {
  const homeId = optionalId(queryString(req.query.home_id), "home_id");
  res.json(await listAutomation(getAuth(req), homeId));
}

export async function toggleAutomationHandler(req: Request, res: Response): Promise<void> {
  const body = (req.body ?? {}) as Record<string, unknown>;
  const enabled = requireBool(body.enabled, "enabled");
  res.json(await toggleAutomation(getAuth(req), parseIdParam(req.params.id), enabled, requestMeta(req)));
}
