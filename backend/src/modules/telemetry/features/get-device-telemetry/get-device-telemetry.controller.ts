import type { Request, Response } from "express";
import { requestMeta } from "../../../../core/http/request-meta";
import { getAuth } from "../../../../core/auth/auth-context";
import { optionalEnum, parseIdParam, queryString } from "../../../../shared/validation/validate";
import { TELEMETRY_RANGES } from "../../domain/telemetry-range";
import { getConsoleDeviceTelemetry, getDeviceTelemetry } from "./get-device-telemetry.handler";

// GET /devices/:deviceId/telemetry?range=24h|7d (portal + mobile)
export async function getDeviceTelemetryController(req: Request, res: Response): Promise<void> {
  const range = optionalEnum(queryString(req.query.range, 8), "range", TELEMETRY_RANGES) ?? "24h";
  res.json(await getDeviceTelemetry(getAuth(req), parseIdParam(req.params.deviceId), range));
}

// GET /api/dashboard/devices/:id/telemetry?range=24h|7d
export async function getConsoleDeviceTelemetryController(req: Request, res: Response): Promise<void> {
  const range = optionalEnum(queryString(req.query.range), "range", TELEMETRY_RANGES) ?? "24h";
  res.json(await getConsoleDeviceTelemetry(getAuth(req), parseIdParam(req.params.id), range, requestMeta(req)));
}
