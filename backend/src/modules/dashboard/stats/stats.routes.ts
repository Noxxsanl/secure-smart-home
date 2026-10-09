import { Router } from "express";
import { adminStatsHandler, badgesHandler, operatorStatsHandler } from "./stats.controller";

export function createStatsRouter(): Router {
  const router = Router();
  router.get("/badges", badgesHandler);
  router.get("/operator", operatorStatsHandler);
  router.get("/admin", adminStatsHandler);
  return router;
}
