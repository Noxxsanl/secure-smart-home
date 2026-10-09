import { Router } from "express";
import { listAutomationHandler, toggleAutomationHandler } from "./automation.controller";

export function createAutomationRouter(): Router {
  const router = Router();
  router.get("/", listAutomationHandler);
  router.patch("/:id", toggleAutomationHandler);
  return router;
}
