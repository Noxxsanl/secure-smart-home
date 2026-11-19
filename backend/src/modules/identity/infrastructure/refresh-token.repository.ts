// SQL refresh token của kênh Mobile (bảng refresh_tokens). Chỉ lưu sha256 của token, không bao giờ lưu bản rõ.
import pool from "../../../infrastructure/database/pool";
import { queryOne, runSql, type Queryable } from "../../../infrastructure/database/db";

export interface RefreshTokenRow {
  id: number;
  user_id: number;
  family_id: string;
  /** true nếu đã hết hạn (so bằng NOW() của PostgreSQL để cùng đồng hồ với ghi expires_at). */
  is_expired: boolean;
  is_revoked: boolean;
}

export async function insertRefreshToken(
  db: Queryable,
  input: { userId: number; tokenHash: string; familyId: string; expiresAt: Date; userAgent: string | null; ip: string | null }
): Promise<number> {
  const result = await runSql(
    `INSERT INTO refresh_tokens (user_id, token_hash, family_id, expires_at, user_agent, ip_address)
     VALUES (?, ?, ?, ?, ?, ?) RETURNING id`,
    [input.userId, input.tokenHash, input.familyId, input.expiresAt, input.userAgent, input.ip],
    db
  );
  return result.insertId;
}

/** `forUpdate` khoá dòng để hai lần refresh đồng thời cùng một token được tuần tự hoá (xoay vòng an toàn). */
export async function findRefreshTokenByHash(tokenHash: string, db: Queryable = pool, forUpdate = false): Promise<RefreshTokenRow | null> {
  return queryOne<RefreshTokenRow>(
    `SELECT id, user_id, family_id, (expires_at <= NOW()) AS is_expired, (revoked_at IS NOT NULL) AS is_revoked
       FROM refresh_tokens WHERE token_hash = ? ${forUpdate ? "FOR UPDATE" : ""}`,
    [tokenHash],
    db
  );
}

/** Đánh dấu token đã xoay: thu hồi và trỏ sang token kế nhiệm. */
export async function markRefreshTokenRotated(db: Queryable, id: number, replacedById: number): Promise<void> {
  await runSql("UPDATE refresh_tokens SET revoked_at = NOW(), replaced_by_id = ? WHERE id = ?", [replacedById, id], db);
}

/** Thu hồi cả "họ" token (mọi token cùng family_id chưa thu hồi). Trả số token bị thu hồi. */
export async function revokeRefreshFamily(db: Queryable, familyId: string): Promise<number> {
  const result = await runSql(
    "UPDATE refresh_tokens SET revoked_at = NOW() WHERE family_id = ? AND revoked_at IS NULL",
    [familyId],
    db
  );
  return result.affectedRows;
}

/** Thu hồi mọi refresh token của một người dùng (đổi mật khẩu, khoá tài khoản). */
export async function revokeAllRefreshTokensOfUser(userId: number, db: Queryable = pool): Promise<number> {
  const result = await runSql(
    "UPDATE refresh_tokens SET revoked_at = NOW() WHERE user_id = ? AND revoked_at IS NULL",
    [userId],
    db
  );
  return result.affectedRows;
}

/**
 * Xoá một lô refresh token hết hạn trước `cutoff` (job purge-refresh-tokens). Trả số dòng đã xoá.
 * PostgreSQL không có DELETE … LIMIT: chọn id của một lô trong truy vấn con rồi xoá theo id.
 * `batchSize` là hằng số của job (không phải input người dùng) nên nối thẳng vào câu SQL như bản cũ.
 */
export async function deleteExpiredRefreshTokenBatch(cutoff: Date, batchSize: number): Promise<number> {
  const result = await runSql(
    `DELETE FROM refresh_tokens WHERE id IN (
  SELECT id FROM refresh_tokens WHERE expires_at < ? LIMIT ${batchSize})`,
    [cutoff]
  );
  return result.affectedRows;
}
