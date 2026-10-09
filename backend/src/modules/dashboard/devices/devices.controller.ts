import type { Request, Response } from "express";
import { requestMeta } from "../../../lib/clientIp";
import { HttpError } from "../../../lib/http";
import {
  nullableId,
  optionalBool,
  optionalEnum,
  optionalId,
  optionalString,
  parseIdParam,
  queryString,
  requireEnum,
} from "../../../lib/validate";
import { DEVICE_CATEGORIES, DEVICE_STATUSES } from "../../../types/domain";
import { getAuth } from "../../auth/authContext";
import type { TelemetryRange } from "../../devices/devices.types";
import {
  assignDevice,
  getConsoleDeviceDetail,
  getDeviceTelemetry,
  listConsoleDevices,
  removeDevice,
  setDeviceStatus,
} from "./devices.service";

const RANGES: readonly TelemetryRange[] = ["24h", "7d"];

export async function listDevicesHandler(req: Request, res: Response): Promise<void> {
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

export async function deviceDetailHandler(req: Request, res: Response): Promise<void> {
  res.json(await getConsoleDeviceDetail(getAuth(req), parseIdParam(req.params.id)));
}

export async function telemetryHandler(req: Request, res: Response): Promise<void> {
  const range = optionalEnum(queryString(req.query.range), "range", RANGES) ?? "24h";
  res.json(await getDeviceTelemetry(getAuth(req), parseIdParam(req.params.id), range, requestMeta(req)));
}

export async function statusHandler(req: Request, res: Response): Promise<void> {
  const body = (req.body ?? {}) as Record<string, unknown>;
  const status = requireEnum(body.status, "status", DEVICE_STATUSES);
  res.json(await setDeviceStatus(getAuth(req), parseIdParam(req.params.id), status, requestMeta(req)));
}

export async function patchDeviceHandler(req: Request, res: Response): Promise<void> {
  const body = (req.body ?? {}) as Record<string, unknown>;
  const deviceName = optionalString(body.device_name, "device_name", { max: 128 });
  const homeId = nullableId(body.home_id, "home_id");
  const roomId = nullableId(body.room_id, "room_id");
  if (deviceName === undefined && homeId === undefined && roomId === undefined) {
    throw new HttpError(400, "MISSING_FIELDS", "device_name, home_id or room_id is required");
  }
  res.json(await assignDevice(getAuth(req), parseIdParam(req.params.id), { deviceName, homeId, roomId }, requestMeta(req)));
}

export async function deleteDeviceHandler(req: Request, res: Response): Promise<void> {
  await removeDevice(getAuth(req), parseIdParam(req.params.id), requestMeta(req));
  res.status(204).end();
}
