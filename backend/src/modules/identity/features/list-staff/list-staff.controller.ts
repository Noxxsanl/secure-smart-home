// GET /api/dashboard/team → StaffAccount[] (chỉ ADMIN).
import type { Request, Response } from "express";
import { getAuth } from "../../../../core/auth/auth-context";
import { listTeam } from "./list-staff.handler";

export async function listStaffController(req: Request, res: Response): Promise<void> {
  res.json(await listTeam(getAuth(req)));
}
