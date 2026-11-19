// Đọc hồ sơ khách: dùng chung cho get-profile và update-profile (trả hồ sơ mới sau khi sửa).
import type { AuthContext } from "../../../core/auth/auth-context";
import { toIsoRequired } from "../../../infrastructure/database/db";
import { notFound } from "../../../shared/errors/http-error";
import { findProfile } from "../infrastructure/profile.repository";
import type { Profile } from "./profile.types";

export async function getProfile(auth: AuthContext): Promise<Profile> {
  const row = await findProfile(auth.userId);
  if (!row) throw notFound("Customer profile not found");
  return { ...row, joined_at: toIsoRequired(row.joined_at) };
}
