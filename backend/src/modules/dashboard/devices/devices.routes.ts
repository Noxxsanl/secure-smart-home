import { Router } from "express";
import {
  deleteDeviceHandler,
  deviceDetailHandler,
  listDevicesHandler,
  patchDeviceHandler,
  statusHandler,
  telemetryHandler,
} from "./devices.controller";

export function createDevicesRouter(): Router {
  const router = Router();
  router.get("/", listDevicesHandler);
  router.get("/:id", deviceDetailHandler);
  router.get("/:id/telemetry", telemetryHandler);
  router.patch("/:id/status", statusHandler);
  router.patch("/:id", patchDeviceHandler);
  router.delete("/:id", deleteDeviceHandler);
  return router;
}
