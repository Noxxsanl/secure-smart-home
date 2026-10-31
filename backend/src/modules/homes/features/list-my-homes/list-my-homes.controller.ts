// GET /homes (portal + mobile).
import type { Request, Response } from "express";
import { getAuth } from "../../../../core/auth/auth-context";
import { listMyHomes } from "./list-my-homes.handler";

export async function listMyHomesController(req: Request, res: Response): Promise<void> {
  res.json(await listMyHomes(getAuth(req).userId));
}
