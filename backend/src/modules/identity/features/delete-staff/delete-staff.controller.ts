// DELETE /api/dashboard/team/:id → 204 (chỉ ADMIN).
import type { Request, Response } from "express";
import { getAuth } from "../../../../core/auth/auth-context";
import { requestMeta } from "../../../../core/http/request-meta";
import { parseIdParam } from "../../../../shared/validation/validate";
import { removeStaff } from "./delete-staff.handler";

export async function deleteStaffController(req: Request, res: Response): Promise<void> {
  await removeStaff(getAuth(req), parseIdParam(req.params.id), requestMeta(req));
  res.status(204).end();
}
