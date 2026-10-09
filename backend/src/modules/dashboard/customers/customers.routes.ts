import { Router } from "express";
import { customerDetailHandler, listCustomersHandler } from "./customers.controller";

export function createCustomersRouter(): Router {
  const router = Router();
  router.get("/", listCustomersHandler);
  router.get("/:id", customerDetailHandler);
  return router;
}
