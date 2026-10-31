// PATCH /api/{portal|mobile}/me/profile  body { full_name?, phone?, address? } → hồ sơ mới
import type { Request, Response } from "express";
import { getAuth } from "../../../../core/auth/auth-context";
import { nullableString, optionalString } from "../../../../shared/validation/validate";
import { updateProfile } from "./update-profile.handler";

export async function updateProfileController(req: Request, res: Response): Promise<void> {
  const auth = getAuth(req);
  const body = (req.body ?? {}) as Record<string, unknown>;
  const profile = await updateProfile(auth, {
    fullName: optionalString(body.full_name, "full_name", { min: 2, max: 128 }),
    // null/"" xoá giá trị (web gửi null)
    phone: nullableString(body.phone, "phone", { max: 20, pattern: /^[0-9 +.-]+$/ }),
    address: nullableString(body.address, "address", { max: 255 }),
  });
  res.json(profile);
}
