// SQL hồ sơ khách hàng. password_hash chỉ được đọc ở đây để so khớp/ghi đè, không bao giờ ra ngoài.
import { queryOne, runSql, type Queryable, type SqlParam } from "../../../infrastructure/database/db";
import type { ProfilePatch, ProfileRow } from "../domain/profile.types";

export async function findProfile(userId: number): Promise<ProfileRow | null> {
  return queryOne<ProfileRow>(
    `SELECT c.id AS customer_id, u.id AS user_id, COALESCE(c.full_name, u.full_name) AS full_name,
            u.email, c.phone, c.address, c.user_tag, c.created_at AS joined_at
       FROM users u JOIN customers c ON c.user_id = u.id
      WHERE u.id = ?`,
    [userId]
  );
}

/** Ghi customers + users.full_name — gọi trong transaction để hai nơi luôn khớp tên. */
export async function updateProfileRows(conn: Queryable, userId: number, patch: ProfilePatch): Promise<void> {
  const sets: string[] = [];
  const params: SqlParam[] = [];
  if (patch.fullName !== undefined) {
    sets.push("full_name = ?");
    params.push(patch.fullName);
  }
  if (patch.phone !== undefined) {
    sets.push("phone = ?");
    params.push(patch.phone);
  }
  if (patch.address !== undefined) {
    sets.push("address = ?");
    params.push(patch.address);
  }
  if (sets.length > 0) {
    await runSql(`UPDATE customers SET ${sets.join(", ")} WHERE user_id = ?`, [...params, userId], conn);
  }
  if (patch.fullName !== undefined) {
    await runSql("UPDATE users SET full_name = ? WHERE id = ?", [patch.fullName, userId], conn);
  }
}

export async function findPasswordHash(userId: number): Promise<string | null> {
  const row = await queryOne<{ password_hash: string }>("SELECT password_hash FROM users WHERE id = ?", [userId]);
  return row?.password_hash ?? null;
}

export async function updatePasswordHash(userId: number, hash: string): Promise<void> {
  await runSql("UPDATE users SET password_hash = ? WHERE id = ?", [hash, userId]);
}
