// Mã kích hoạt (FR-2.4, FR-3.x) và gán chủ nhà race-safe (CONTRACT_V2 §4.2 Claim, §5 assign-owner).
//
// Tất cả hàm nhận `conn` đang ở trong withTransaction() của người gọi và KHÔNG ghi audit:
// người gọi (endpoint) ghi audit/activation_logs/notification theo ngữ cảnh kênh của mình:
//   issueActivationCode  → audit ACTIVATION_CODE_CREATED
//   revokeActivationCodes → audit ACTIVATION_CODE_REVOKED
//   assignOwner          → activation_logs + audit ACTIVATION_SUCCESS (claim) | OWNER_ASSIGNED (operator)
import { env } from "../../config/env";
import { buildQrPayload, formatActivationCode, generateActivationCode, hashActivationCode } from "../../lib/activationCode";
import { isDuplicateKeyError, queryOne, runSql, toIsoRequired, type Queryable } from "../../lib/db";
import { HttpError, notFound } from "../../lib/http";
import { getHomeRow } from "./homes.repository";
import type { ActivationCodeIssued, HomeRow } from "./homes.types";

const MAX_CODE_ATTEMPTS = 5;
const DAY_MS = 24 * 3600 * 1000;

/** Khoá dòng nhà (FOR UPDATE) để tuần tự hoá phát mã/claim/gán chủ trên cùng một nhà. */
async function lockHomeStatus(conn: Queryable, homeId: number): Promise<{ id: number; status: string }> {
  const row = await queryOne<{ id: number; status: string }>(
    "SELECT id, status FROM smart_homes WHERE id = ? FOR UPDATE",
    [homeId],
    conn
  );
  if (!row) throw notFound("Home not found");
  return row;
}

/**
 * Thu hồi mọi mã CHƯA dùng và CHƯA thu hồi của nhà. Trả số mã bị thu hồi (0 = không có mã nào để thu hồi).
 * `revokedBy` = users.id của người thao tác (null nếu hệ thống).
 */
export async function revokeActivationCodes(conn: Queryable, homeId: number, revokedBy: number | null): Promise<number> {
  const result = await runSql(
    `UPDATE activation_tokens SET revoked_at = NOW(), revoked_by = ?
      WHERE home_id = ? AND used_at IS NULL AND revoked_at IS NULL`,
    [revokedBy, homeId],
    conn
  );
  return result.affectedRows;
}

/**
 * Phát mã kích hoạt mới cho nhà CHƯA claim: thu hồi mã cũ chưa dùng rồi tạo mã mới
 * (mặc định hạn env.activationCodeTtlDays = 180 ngày). DB chỉ lưu sha256; `code` và `qr_payload`
 * bản rõ chỉ có trong giá trị trả về — người gọi trả nguyên cho response tạo/tạo lại và KHÔNG lưu/log.
 * Nhà đã claim → 409 ALREADY_CLAIMED; nhà không tồn tại → 404.
 */
export async function issueActivationCode(
  conn: Queryable,
  input: { homeId: number; createdBy: number | null; ttlDays?: number }
): Promise<ActivationCodeIssued> {
  const home = await lockHomeStatus(conn, input.homeId);
  if (home.status !== "unclaimed") {
    throw new HttpError(409, "ALREADY_CLAIMED", "Home has already been claimed");
  }

  await revokeActivationCodes(conn, input.homeId, input.createdBy);

  const ttlDays = input.ttlDays ?? env.activationCodeTtlDays;
  const expiresAt = new Date(Date.now() + ttlDays * DAY_MS);

  for (let attempt = 0; attempt < MAX_CODE_ATTEMPTS; attempt++) {
    const code12 = generateActivationCode();
    try {
      await runSql(
        "INSERT INTO activation_tokens (home_id, code_hash, expires_at, created_by) VALUES (?, ?, ?, ?)",
        [input.homeId, hashActivationCode(code12), expiresAt, input.createdBy],
        conn
      );
      return {
        code: formatActivationCode(code12),
        qr_payload: buildQrPayload(code12),
        expires_at: toIsoRequired(expiresAt),
      };
    } catch (err) {
      // Trùng code_hash (xác suất ~2^-60) → sinh mã khác; lỗi khác thì ném tiếp
      if (!isDuplicateKeyError(err, "uq_activation_tokens_code_hash")) throw err;
    }
  }
  throw new Error("issueActivationCode: could not generate a unique code");
}

export interface AssignOwnerInput {
  homeId: number;
  /** users.id của khách trở thành OWNER. */
  userId: number;
  /**
   * Claim bằng mã: id activation_tokens đã được xác thực → đánh dấu đã dùng. Bỏ trống khi Operator
   * gán thẳng (khi đó mọi mã chưa dùng của nhà bị thu hồi).
   */
  tokenId?: number;
  /** users.id của Operator/Admin thao tác — ghi vào revoked_by khi thu hồi mã còn lại. */
  actorUserId?: number | null;
  /**
   * Mã lỗi 409 khi nhà đã bị người khác claim trước (race): claim dùng "ALREADY_USED" (mặc định),
   * Operator gán dùng "ALREADY_CLAIMED".
   */
  conflictCode?: "ALREADY_USED" | "ALREADY_CLAIMED";
}

/**
 * Biến `userId` thành OWNER của nhà. Race-safe (FR-3.4): hai claim đồng thời → đúng một người thắng.
 *   1. SELECT … FOR UPDATE nhà (tuần tự hoá),
 *   2. UPDATE activation_tokens … WHERE used_at IS NULL AND revoked_at IS NULL — affectedRows 0 → 409,
 *   3. UPDATE smart_homes SET status='active' … WHERE status='unclaimed' — affectedRows 0 → 409,
 *   4. INSERT thành viên OWNER.
 * Ném HttpError (404 nhà không tồn tại, 409 conflictCode) → withTransaction rollback toàn bộ.
 * Trả HomeRow mới (status 'active').
 */
export async function assignOwner(conn: Queryable, input: AssignOwnerInput): Promise<HomeRow> {
  const conflictCode = input.conflictCode ?? "ALREADY_USED";
  await lockHomeStatus(conn, input.homeId);

  if (input.tokenId !== undefined) {
    const used = await runSql(
      `UPDATE activation_tokens SET used_at = NOW(), used_by_user_id = ?
        WHERE id = ? AND home_id = ? AND used_at IS NULL AND revoked_at IS NULL`,
      [input.userId, input.tokenId, input.homeId],
      conn
    );
    if (used.affectedRows === 0) throw new HttpError(409, conflictCode, "Activation code was already used or revoked");
  }

  const claimed = await runSql(
    `UPDATE smart_homes SET status = 'active', owner_user_id = ?, claimed_at = NOW()
      WHERE id = ? AND status = 'unclaimed'`,
    [input.userId, input.homeId],
    conn
  );
  if (claimed.affectedRows === 0) throw new HttpError(409, conflictCode, "Home has already been claimed");

  // Mọi mã còn lại của nhà (nếu có) mất hiệu lực: nhà đã có chủ
  await runSql(
    `UPDATE activation_tokens SET revoked_at = NOW(), revoked_by = ?
      WHERE home_id = ? AND used_at IS NULL AND revoked_at IS NULL`,
    [input.actorUserId ?? null, input.homeId],
    conn
  );

  await runSql(
    "INSERT INTO smart_home_members (home_id, user_id, member_role, accepted_at) VALUES (?, ?, 'OWNER', NOW())",
    [input.homeId, input.userId],
    conn
  );

  const home = await getHomeRow(input.homeId, conn);
  if (!home) throw notFound("Home not found");
  return home;
}
