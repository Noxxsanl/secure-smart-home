// /homes/:homeId/suggestions, /suggestions/:id/accept|dismiss (CONTRACT §4.2).
import { Router } from "express";
import { requestMeta } from "../../../lib/clientIp";
import { optionalString, parseIdParam } from "../../../lib/validate";
import { getAuth } from "../../auth/authContext";
import { acceptSuggestion, dismissSuggestion, listHomeSuggestions } from "./suggestions.service";

export function createSuggestionsRouter(): Router {
  const router = Router();

  router.get("/homes/:homeId/suggestions", async (req, res) => {
    res.json(await listHomeSuggestions(getAuth(req), parseIdParam(req.params.homeId)));
  });

  router.post("/suggestions/:id/accept", async (req, res) => {
    res.json(await acceptSuggestion(getAuth(req), parseIdParam(req.params.id), requestMeta(req)));
  });

  router.post("/suggestions/:id/dismiss", async (req, res) => {
    const body = (req.body ?? {}) as Record<string, unknown>;
    const reason = optionalString(body.reason, "reason", { max: 255 }) ?? null;
    res.json(await dismissSuggestion(getAuth(req), parseIdParam(req.params.id), reason, requestMeta(req)));
  });

  return router;
}
