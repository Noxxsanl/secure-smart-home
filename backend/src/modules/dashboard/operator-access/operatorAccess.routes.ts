import { Router } from "express";
import { createGrantHandler, listGrantsHandler, revokeGrantHandler } from "./operatorAccess.controller";

export function createOperatorAccessRouter(): Router {
  const router = Router();
  router.get("/", listGrantsHandler);
  router.post("/", createGrantHandler);
  router.post("/:id/revoke", revokeGrantHandler);
  return router;
}
