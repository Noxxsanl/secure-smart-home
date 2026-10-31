// SQL của luồng kích hoạt nhà (activation_tokens + chuyển trạng thái smart_homes + thành viên OWNER). Mọi hàm
// nhận `conn` đang ở trong withTransaction() của người gọi; thứ tự gọi do domain/activation.ts quyết định.
import { queryOne, runSql, type Queryable } from "../../../infrastructure/database/db";

/**
 * Khoá dòng nhà (FOR UPDATE) để tuần tự hoá phát mã/claim/gán chủ trên cùng một nhà. Trả null nếu nhà
 * không tồn tại (người gọi ném 404).
 */
export async function lockHomeStatus(conn: Queryable, homeId: number): Promise<{ id: number; status: string } | null> {
  return queryOne<{ id: number; status: string }>(
    "SELECT id, status FROM smart_homes WHERE id = ? FOR UPDATE",
    [homeId],
    conn
  );
}

/**
 * Thu hồi mọi mã CHƯA dùng và CHƯA thu hồi của nhà. Trả số mã bị thu hồi.
 * `revokedBy` = users.id của người thao tác (null nếu hệ thống).
 */
export async function revokeUnusedTokens(conn: Queryable, homeId: number, revokedBy: number | null): Promise<number> {
  const result = await runSql(
    `UPDATE activation_tokens SET revoked_at = NOW(), revoked_by = ?
      WHERE home_id = ? AND used_at IS NULL AND revoked_at IS NULL`,
    [revokedBy, homeId],
    conn
  );
  return result.affectedRows;
}

/**
 * Chèn mã mới; trả false nếu trùng code_hash (đã có dòng khác). ON CONFLICT DO NOTHING thay vì bắt lỗi 23505:
 * trong PostgreSQL một câu lệnh lỗi làm HỎNG cả transaction (mọi lệnh sau đó báo "current transaction is
 * aborted"), nên không thể thử lại sau khi trùng khoá. Đích chỉ định = uq_activation_tokens_code_hash, để lỗi
 * khác (vd FK home_id) không bị nuốt.
 */
export async function insertActivationToken(
  conn: Queryable,
  input: { homeId: number; codeHash: string; expiresAt: Date; createdBy: number | null }
): Promise<boolean> {
  const inserted = await runSql(
    `INSERT INTO activation_tokens (home_id, code_hash, expires_at, created_by) VALUES (?, ?, ?, ?)
       ON CONFLICT (code_hash) DO NOTHING`,
    [input.homeId, input.codeHash, input.expiresAt, input.createdBy],
    conn
  );
  return inserted.affectedRows > 0;
}

/** Đánh dấu mã đã dùng nếu còn hiệu lực; trả số dòng cập nhật (0 = đã dùng/thu hồi → 409). */
export async function markTokenUsed(
  conn: Queryable,
  input: { tokenId: number; homeId: number; userId: number }
): Promise<number> {
  const used = await runSql(
    `UPDATE activation_tokens SET used_at = NOW(), used_by_user_id = ?
        WHERE id = ? AND home_id = ? AND used_at IS NULL AND revoked_at IS NULL`,
    [input.userId, input.tokenId, input.homeId],
    conn
  );
  return used.affectedRows;
}

/** unclaimed → active + gán chủ; trả số dòng cập nhật (0 = nhà đã bị claim trước → 409). */
export async function markHomeClaimed(conn: Queryable, homeId: number, userId: number): Promise<number> {
  const claimed = await runSql(
    `UPDATE smart_homes SET status = 'active', owner_user_id = ?, claimed_at = NOW()
      WHERE id = ? AND status = 'unclaimed'`,
    [userId, homeId],
    conn
  );
  return claimed.affectedRows;
}

export async function insertOwnerMember(conn: Queryable, homeId: number, userId: number): Promise<void> {
  await runSql(
    "INSERT INTO smart_home_members (home_id, user_id, member_role, accepted_at) VALUES (?, ?, 'OWNER', NOW())",
    [homeId, userId],
    conn
  );
}
