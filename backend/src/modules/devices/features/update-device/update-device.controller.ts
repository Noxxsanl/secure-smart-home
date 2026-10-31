import type { Request, Response } from "express";
import { requestMeta } from "../../../../core/http/request-meta";
import { getAuth } from "../../../../core/auth/auth-context";
import { HttpError } from "../../../../shared/errors/http-error";
import { nullableId, optionalString, parseIdParam } from "../../../../shared/validation/validate";
import { assignDevice } from "./update-device.handler";

// PATCH /api/dashboard/devices/:id — đổi tên và/hoặc gán nhà/phòng
export async function updateDeviceController(req: Request, res: Response): Promise<void> {
  const body = (req.body ?? {}) as Record<string, unknown>;
  const deviceName = optionalString(body.device_name, "device_name", { max: 128 });
  const homeId = nullableId(body.home_id, "home_id");
  const roomId = nullableId(body.room_id, "room_id");
  if (deviceName === undefined && homeId === undefined && roomId === undefined) {
    throw new HttpError(400, "MISSING_FIELDS", "device_name, home_id or room_id is required");
  }
  res.json(await assignDevice(getAuth(req), parseIdParam(req.params.id), { deviceName, homeId, roomId }, requestMeta(req)));
}
