// /devices/:deviceId, /devices/:deviceId/commands, /devices/:deviceId/telemetry.
import { Router } from "express";
import { requestMeta } from "../../../lib/clientIp";
import { optionalEnum, parseIdParam, queryString, requireEnum, requireString } from "../../../lib/validate";
import { getAuth } from "../../auth/authContext";
import type { DeviceAction, TelemetryRange } from "../../devices/devices.types";
import type { CustomerChannel } from "../customer.types";
import { commandDevice, getDeviceDetail, getDeviceTelemetry, renameDevice } from "./devices.service";

const ACTIONS: readonly DeviceAction[] = ["turn_on", "turn_off"];
const RANGES: readonly TelemetryRange[] = ["24h", "7d"];

export function createDevicesRouter(channel: CustomerChannel): Router {
  const router = Router();

  router.get("/devices/:deviceId", async (req, res) => {
    res.json(await getDeviceDetail(getAuth(req), parseIdParam(req.params.deviceId)));
  });

  router.patch("/devices/:deviceId", async (req, res) => {
    const body = (req.body ?? {}) as Record<string, unknown>;
    const name = requireString(body.device_name, "device_name", { max: 128 });
    res.json(await renameDevice(getAuth(req), parseIdParam(req.params.deviceId), name, requestMeta(req)));
  });

  router.post("/devices/:deviceId/commands", async (req, res) => {
    const body = (req.body ?? {}) as Record<string, unknown>;
    const action = requireEnum(body.action, "action", ACTIONS);
    res.json(await commandDevice(getAuth(req), parseIdParam(req.params.deviceId), action, channel, requestMeta(req)));
  });

  router.get("/devices/:deviceId/telemetry", async (req, res) => {
    const range = optionalEnum(queryString(req.query.range, 8), "range", RANGES) ?? "24h";
    res.json(await getDeviceTelemetry(getAuth(req), parseIdParam(req.params.deviceId), range));
  });

  return router;
}
