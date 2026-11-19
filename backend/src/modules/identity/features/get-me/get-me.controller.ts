// GET /…/auth/me → { user } từ req.auth (đã nạp lại từ DB bởi guard của kênh) — không cần truy vấn lại.
import type { Request, Response } from "express";
import { getAuth } from "../../../../core/auth/auth-context";
import { authToMeUser } from "../../domain/auth-user.mapper";

export function getMeController(req: Request, res: Response): void {
  res.json({ user: authToMeUser(getAuth(req)) });
}
