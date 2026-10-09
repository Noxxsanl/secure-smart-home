import { Router } from "express";
import { factoryResetHandler, gatewayDetailHandler, listGatewaysHandler, restartHandler } from "./gateways.controller";

export function createGatewaysRouter(): Router {
  const router = Router();
  router.get("/", listGatewaysHandler);
  router.get("/:id", gatewayDetailHandler);
  router.post("/:id/restart", restartHandler);
  router.post("/:id/factory-reset", factoryResetHandler);
  return router;
}
