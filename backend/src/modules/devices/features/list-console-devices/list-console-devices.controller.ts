import type { Request, Response } from "express";
import { getAuth } from "../../../../core/auth/auth-context";
import { optionalBool, optionalEnum, optionalId, queryString } from "../../../../shared/validation/validate";
import { DEVICE_CATEGORIES, DEVICE_STATUSES } from "../../../../shared/types/domain";
import { listConsoleDevices } from "./list-console-devices.handler";

// GET /api/dashboard/devices
export async function listConsoleDevicesController(req: Request, res: Response): Promise<void> {
  res.json(
    await listConsoleDevices(getAuth(req), {
      homeId: optionalId(queryString(req.query.home_id), "home_id"),
      category: optionalEnum(queryString(req.query.category), "category", DEVICE_CATEGORIES),
      status: optionalEnum(queryString(req.query.status), "status", DEVICE_STATUSES),
      q: queryString(req.query.q, 100),
      includeGateways: optionalBool(queryString(req.query.include_gateways), "include_gateways") ?? false,
    })
  );
}
