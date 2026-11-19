// Sửa hồ sơ khách: ghi customers + users.full_name trong MỘT transaction rồi trả hồ sơ mới.
import type { AuthContext } from "../../../../core/auth/auth-context";
import { withTransaction } from "../../../../infrastructure/database/db";
import { HttpError } from "../../../../shared/errors/http-error";
import { getProfile } from "../../domain/profile.service";
import type { Profile, ProfilePatch } from "../../domain/profile.types";
import { updateProfileRows } from "../../infrastructure/profile.repository";

export async function updateProfile(auth: AuthContext, patch: ProfilePatch): Promise<Profile> {
  if (patch.fullName === undefined && patch.phone === undefined && patch.address === undefined) {
    throw new HttpError(400, "MISSING_FIELDS", "At least one of full_name, phone, address is required");
  }
  await withTransaction((conn) => updateProfileRows(conn, auth.userId, patch));
  return getProfile(auth);
}
