// /homes, /homes/:homeId/overview, PATCH /homes/:homeId, /rooms/:roomId (controller gộp trong route).
import { Router } from "express";
import { requestMeta } from "../../../lib/clientIp";
import { nullableString, optionalString, parseIdParam, requireString } from "../../../lib/validate";
import { getAuth } from "../../auth/authContext";
import { getOverview, getRoom, listMyHomes, patchHome, renameRoom } from "./homes.service";

export function createHomesRouter(): Router {
  const router = Router();

  router.get("/homes", async (req, res) => {
    res.json(await listMyHomes(getAuth(req).userId));
  });

  router.get("/homes/:homeId/overview", async (req, res) => {
    res.json(await getOverview(getAuth(req), parseIdParam(req.params.homeId)));
  });

  router.patch("/homes/:homeId", async (req, res) => {
    const body = (req.body ?? {}) as Record<string, unknown>;
    const home = await patchHome(
      getAuth(req),
      parseIdParam(req.params.homeId),
      {
        name: optionalString(body.name, "name", { max: 128 }),
        address: nullableString(body.address, "address", { max: 255 }),
      },
      requestMeta(req)
    );
    res.json(home);
  });

  router.get("/rooms/:roomId", async (req, res) => {
    res.json(await getRoom(getAuth(req), parseIdParam(req.params.roomId)));
  });

  router.patch("/rooms/:roomId", async (req, res) => {
    const body = (req.body ?? {}) as Record<string, unknown>;
    const name = requireString(body.name, "name", { max: 64 });
    res.json(await renameRoom(getAuth(req), parseIdParam(req.params.roomId), name, requestMeta(req)));
  });

  return router;
}
