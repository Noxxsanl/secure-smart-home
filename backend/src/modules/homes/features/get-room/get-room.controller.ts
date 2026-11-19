// GET /rooms/:roomId (portal + mobile).
import type { Request, Response } from "express";
import { parseIdParam } from "../../../../shared/validation/validate";
import { getAuth } from "../../../../core/auth/auth-context";
import { getRoom } from "./get-room.handler";

export async function getRoomController(req: Request, res: Response): Promise<void> {
  res.json(await getRoom(getAuth(req), parseIdParam(req.params.roomId)));
}
