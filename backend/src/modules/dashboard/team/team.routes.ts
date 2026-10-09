import { Router } from "express";
import { createTeamHandler, deleteTeamHandler, listTeamHandler, patchTeamHandler } from "./team.controller";

export function createTeamRouter(): Router {
  const router = Router();
  router.get("/", listTeamHandler);
  router.post("/", createTeamHandler);
  router.patch("/:id", patchTeamHandler);
  router.delete("/:id", deleteTeamHandler);
  return router;
}
