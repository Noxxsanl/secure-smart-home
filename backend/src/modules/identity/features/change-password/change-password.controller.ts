// POST /api/{portal|mobile}/me/password  body { current_password, new_password } → 204
import type { Request, Response } from "express";
import { getAuth } from "../../../../core/auth/auth-context";
import { requestMeta } from "../../../../core/http/request-meta";
import { requireString } from "../../../../shared/validation/validate";
import { changePassword } from "./change-password.handler";

export async function changePasswordController(req: Request, res: Response): Promise<void> {
  const body = (req.body ?? {}) as Record<string, unknown>;
  const current = requireString(body.current_password, "current_password", { max: 128, trim: false });
  const next = requireString(body.new_password, "new_password", { min: 8, max: 128, trim: false });
  await changePassword(getAuth(req), current, next, requestMeta(req));
  res.status(204).end();
}
