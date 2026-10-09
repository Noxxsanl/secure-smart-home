import { Router } from "express";
import { deleteLogsHandler, listLogsHandler } from "./logs.controller";

export function createLogsRouter(): Router {
  const router = Router();
  router.get("/:category", listLogsHandler);
  router.delete("/:category", deleteLogsHandler);
  return router;
}
