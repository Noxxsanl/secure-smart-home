// PATCH /rooms/:roomId (portal + mobile).
import type { Request, Response } from "express";
import { requestMeta } from "../../../../core/http/request-meta";
import { parseIdParam, requireString } from "../../../../shared/validation/validate";
import { getAuth } from "../../../../core/auth/auth-context";
import { renameRoom } from "./rename-room.handler";

export async function renameRoomController(req: Request, res: Response): Promise<void> {
  const body = (req.body ?? {}) as Record<string, unknown>;
  const name = requireString(body.name, "name", { max: 64 });
  res.json(await renameRoom(getAuth(req), parseIdParam(req.params.roomId), name, requestMeta(req)));
}
