import { Router } from "express";
import {
  accessRequestHandler,
  assignOwnerHandler,
  createCodeHandler,
  createHandler,
  detailHandler,
  listHandler,
  patchHandler,
  revokeCodeHandler,
} from "./smartHomes.controller";

export function createSmartHomesRouter(): Router {
  const router = Router();
  router.get("/", listHandler);
  router.post("/", createHandler);
  router.get("/:id", detailHandler);
  router.patch("/:id", patchHandler);
  router.post("/:id/assign-owner", assignOwnerHandler);
  router.post("/:id/activation-codes", createCodeHandler);
  router.post("/:id/activation-codes/revoke", revokeCodeHandler);
  router.post("/:id/access-requests", accessRequestHandler);
  return router;
}
