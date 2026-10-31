// POST /api/dashboard/team  body { username, password, role: "operator" } → 201 StaffAccount (chỉ ADMIN).
import type { Request, Response } from "express";
import { getAuth } from "../../../../core/auth/auth-context";
import { requestMeta } from "../../../../core/http/request-meta";
import { requireEnum, requireString } from "../../../../shared/validation/validate";
import { createStaff } from "./create-staff.handler";

const USERNAME_RE = /^[a-z0-9._-]{3,32}$/;

export async function createStaffController(req: Request, res: Response): Promise<void> {
  const auth = getAuth(req);
  const body = (req.body ?? {}) as Record<string, unknown>;
  const created = await createStaff(
    auth,
    {
      username: requireString(body.username, "username", { min: 3, max: 32, pattern: USERNAME_RE }),
      // Mật khẩu: không trim (khoảng trắng là ký tự hợp lệ)
      password: requireString(body.password, "password", { min: 8, max: 128, trim: false }),
      role: requireEnum(body.role, "role", ["operator"] as const),
    },
    requestMeta(req)
  );
  res.status(201).json(created);
}
