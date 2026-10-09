import express, { Router } from "express";
import {
  adminOnly,
  createDeploymentHandler,
  listDeploymentsHandler,
  listFirmwareHandler,
  patchFirmwareHandler,
  rollbackDeploymentHandler,
  uploadFirmwareHandler,
} from "./firmware.controller";

export function createFirmwareRouter(): Router {
  const router = Router();
  router.get("/", listFirmwareHandler);
  // express.raw chỉ gắn ở route upload (body nhị phân ≤ 4 MB); phần còn lại của API vẫn bị giới hạn 10 KB JSON
  router.post("/", adminOnly, express.raw({ type: "application/octet-stream", limit: "4mb" }), uploadFirmwareHandler);
  router.patch("/:id", patchFirmwareHandler);
  return router;
}

export function createOtaRouter(): Router {
  const router = Router();
  router.get("/deployments", listDeploymentsHandler);
  router.post("/deployments", createDeploymentHandler);
  router.post("/deployments/:id/rollback", rollbackDeploymentHandler);
  return router;
}
