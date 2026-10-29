// SQL của xác thực: nạp người dùng, tạo tài khoản khách (users + customers), refresh token.
// password_hash chỉ xuất hiện trong LoginUserRow và không bao giờ ra khỏi module auth.
import pool from "../../config/db";
import { queryOne, runSql, type Queryable, type SqlParam } from "../../lib/db";
import type { AuthUserRow, LoginUserRow } from "./auth.types";
import { buildUserTag } from "./userTag";

// full_name: hồ sơ khách (customers.full_name) là nguồn chính, users.full_name là bản sao lúc đăng ký.
const USER_COLUMNS = `u.id, u.username, u.email, COALESCE(c.full_name, u.full_name) AS full_name,
  u.role, u.status, u.token_version, c.id AS customer_id, c.user_tag`;
const USER_FROM = "FROM users u LEFT JOIN customers c ON c.user_id = u.id";

/** Nạp người dùng theo id — chạy ở MỖI request đã xác thực (role/khoá tài khoản có hiệu lực ngay). */
export async function findAuthUserById(id: number, db: Queryable = pool): Promise<AuthUserRow | null> {
  return queryOne<AuthUserRow>(`SELECT ${USER_COLUMNS} ${USER_FROM} WHERE u.id = ?`, [id], db);
}

/**
 * Tìm người dùng để đăng nhập bằng username HOẶC email (dashboard) và thêm user_tag (portal/mobile).
 * Portal/mobile vẫn khớp username để nhân viên đăng nhập nhầm cổng nhận được WRONG_PORTAL/USE_DASHBOARD
 * thay vì INVALID_CREDENTIALS.
 */
export async function findLoginUser(identifier: string, allowUserTag: boolean): Promise<LoginUserRow | null> {
  // LOWER(): PostgreSQL phân biệt hoa/thường; khớp unique index LOWER(username)/LOWER(email). user_tag sinh ra
  // toàn chữ thường nhưng người dùng có thể gõ "Dat#4821" nên cũng so không phân biệt hoa/thường.
  const where = allowUserTag
    ? "LOWER(u.username) = LOWER(?) OR LOWER(u.email) = LOWER(?) OR LOWER(c.user_tag) = LOWER(?)"
    : "LOWER(u.username) = LOWER(?) OR LOWER(u.email) = LOWER(?)";
  const params: SqlParam[] = allowUserTag ? [identifier, identifier, identifier] : [identifier, identifier];
  return queryOne<LoginUserRow>(
    `SELECT ${USER_COLUMNS}, u.password_hash ${USER_FROM} WHERE ${where} LIMIT 1`,
    params
  );
}

/** Vô hiệu hoá mọi JWT đã cấp cho user (cookie dashboard/portal, access token mobile). */
export async function bumpTokenVersion(userId: number, db: Queryable = pool): Promise<void> {
  await runSql("UPDATE users SET token_version = token_version + 1 WHERE id = ?", [userId], db);
}

export async function touchLastLogin(userId: number): Promise<void> {
  await runSql("UPDATE users SET last_login = NOW() WHERE id = ?", [userId]);
}

// ── Đăng ký khách hàng ─────────────────────────────────────────────────────

export interface NewCustomerInput {
  email: string;
  passwordHash: string;
  fullName: string;
  phone: string | null;
}

export interface CreatedCustomer {
  userId: number;
  customerId: number;
  userTag: string;
}

const USER_TAG_ATTEMPTS_4_DIGITS = 8;
const USER_TAG_ATTEMPTS_TOTAL = 16;

/**
 * Tạo users (role 'user', username NULL) + customers (user_tag duy nhất). GỌI TRONG TRANSACTION
 * (withTransaction) — hai bảng phải cùng thành công hoặc cùng huỷ (invariant 9). Email trùng ném lỗi
 * lỗi trùng khoá (23505) của uq_users_email (người gọi đổi thành 409 EMAIL_TAKEN). user_tag trùng thì sinh lại:
 * 8 lần với 4 chữ số, sau đó 6 chữ số khi họ tên phổ biến làm cạn không gian 4 chữ số.
 */
export async function createUserWithCustomer(conn: Queryable, input: NewCustomerInput): Promise<CreatedCustomer> {
  const userResult = await runSql(
    `INSERT INTO users (username, email, full_name, password_hash, role, status)
     VALUES (NULL, ?, ?, ?, 'user', 'active') RETURNING id`,
    [input.email, input.fullName, input.passwordHash],
    conn
  );
  const userId = userResult.insertId;

  for (let attempt = 0; attempt < USER_TAG_ATTEMPTS_TOTAL; attempt++) {
    const userTag = buildUserTag(input.fullName, attempt < USER_TAG_ATTEMPTS_4_DIGITS ? 4 : 6);
    // ON CONFLICT DO NOTHING thay vì bắt lỗi 23505: trong PostgreSQL một câu lệnh lỗi làm HỎNG cả transaction
    // (các lệnh sau báo "current transaction is aborted"), nên không thể thử tag khác sau khi trùng khoá.
    // user_id vừa tạo ở trên nên xung đột chỉ có thể do user_tag — chỉ định đích (uq_customers_user_tag)
    // để lỗi khác (vd trùng user_id) vẫn nổi lên thay vì bị nuốt.
    const customerResult = await runSql(
      `INSERT INTO customers (user_id, full_name, phone, user_tag) VALUES (?, ?, ?, ?)
       ON CONFLICT (user_tag) DO NOTHING RETURNING id`,
      [userId, input.fullName, input.phone, userTag],
      conn
    );
    if (customerResult.affectedRows > 0) return { userId, customerId: customerResult.insertId, userTag };
  }
  throw new Error("createUserWithCustomer: could not generate a unique user_tag");
}

// ── Refresh token (Mobile) ─────────────────────────────────────────────────

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
