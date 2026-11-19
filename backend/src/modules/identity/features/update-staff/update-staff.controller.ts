// PATCH /api/dashboard/team/:id  body { status?, password? } → StaffAccount (chỉ ADMIN).
import type { Request, Response } from "express";
import { getAuth } from "../../../../core/auth/auth-context";
import { requestMeta } from "../../../../core/http/request-meta";
import { HttpError } from "../../../../shared/errors/http-error";
import { optionalEnum, optionalString, parseIdParam } from "../../../../shared/validation/validate";
import { patchStaff } from "./update-staff.handler";

export async function updateStaffController(req: Request, res: Response): Promise<void> {
  const body = (req.body ?? {}) as Record<string, unknown>;
  const status = optionalEnum(body.status, "status", ["active", "locked"] as const);
  const password = optionalString(body.password, "password", { min: 8, max: 128, trim: false });
  if (status === undefined && password === undefined) throw new HttpError(400, "MISSING_FIELDS", "status or password is required");
  res.json(await patchStaff(getAuth(req), parseIdParam(req.params.id), { status, password }, requestMeta(req)));
}
