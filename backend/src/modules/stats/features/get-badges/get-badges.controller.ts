import type { Request, Response } from "express";
import { getAuth } from "../../../../core/auth/auth-context";
import { getBadges } from "./get-badges.handler";

export async function getBadgesController(req: Request, res: Response): Promise<void> {
  res.json(await getBadges(getAuth(req)));
}
