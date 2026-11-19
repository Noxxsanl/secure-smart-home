// GET /api/{portal|mobile}/me/profile → hồ sơ khách (CONTRACT §4.2 Profile). Đọc qua domain/profile.service.ts
// vì update-profile cũng trả lại hồ sơ sau khi sửa.
import type { Request, Response } from "express";
import { getAuth } from "../../../../core/auth/auth-context";
import { getProfile } from "../../domain/profile.service";

export async function getProfileController(req: Request, res: Response): Promise<void> {
  res.json(await getProfile(getAuth(req)));
}
