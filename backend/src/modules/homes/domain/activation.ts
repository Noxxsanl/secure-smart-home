// Mã kích hoạt (FR-2.4, FR-3.x) và gán chủ nhà race-safe (CONTRACT_V2 §4.2 Claim, §5 assign-owner).
//
// Tất cả hàm nhận `conn` đang ở trong withTransaction() của người gọi và KHÔNG ghi audit:
// người gọi (feature) ghi audit/activation_logs/notification theo ngữ cảnh kênh của mình:
//   issueActivationCode  → audit ACTIVATION_CODE_CREATED
//   revokeActivationCodes → audit ACTIVATION_CODE_REVOKED
//   assignOwner          → activation_logs + audit ACTIVATION_SUCCESS (claim-home) | OWNER_ASSIGNED (assign-owner)
// SQL nằm ở infrastructure/activation.repository.ts; file này giữ THỨ TỰ các bước (quan trọng cho race-safe).
import { env } from "../../../config/env";
import {
  buildQrPayload,
  formatActivationCode,
  generateActivationCode,
  hashActivationCode,
} from "./activation-code";
import { toIsoRequired, type Queryable } from "../../../infrastructure/database/db";
import { HttpError, notFound } from "../../../shared/errors/http-error";
import { getHomeRow } from "../infrastructure/home.read-model";
import {
  insertActivationToken,
  insertOwnerMember,
  lockHomeStatus as lockHomeStatusRow,
  markHomeClaimed,
  markTokenUsed,
  revokeUnusedTokens,
} from "../infrastructure/activation.repository";
import type { ActivationCodeIssued, HomeRow } from "./home.types";

const MAX_CODE_ATTEMPTS = 5;
const DAY_MS = 24 * 3600 * 1000;

/** Khoá dòng nhà (FOR UPDATE) để tuần tự hoá phát mã/claim/gán chủ trên cùng một nhà. */
async function lockHomeStatus(conn: Queryable, homeId: number): Promise<{ id: number; status: string }> {
  const row = await lockHomeStatusRow(conn, homeId);
  if (!row) throw notFound("Home not found");
  return row;
}

/**
 * Thu hồi mọi mã CHƯA dùng và CHƯA thu hồi của nhà. Trả số mã bị thu hồi (0 = không có mã nào để thu hồi).
 * `revokedBy` = users.id của người thao tác (null nếu hệ thống).
 */
export async function revokeActivationCodes(conn: Queryable, homeId: number, revokedBy: number | null): Promise<number> {
  return revokeUnusedTokens(conn, homeId, revokedBy);
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
    // ON CONFLICT DO NOTHING thay vì bắt lỗi 23505 (giải thích ở activation.repository.insertActivationToken):
    // không thể thử lại sau khi trùng khoá trong cùng transaction PostgreSQL.
    const inserted = await insertActivationToken(conn, {
      homeId: input.homeId,
      codeHash: hashActivationCode(code12),
      expiresAt,
      createdBy: input.createdBy,
    });
    if (inserted) {
      return {
        code: formatActivationCode(code12),
        qr_payload: buildQrPayload(code12),
        expires_at: toIsoRequired(expiresAt),
      };
    }
    // Trùng code_hash (xác suất ~2^-60) → sinh mã khác
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
    const used = await markTokenUsed(conn, { tokenId: input.tokenId, homeId: input.homeId, userId: input.userId });
    if (used === 0) throw new HttpError(409, conflictCode, "Activation code was already used or revoked");
  }

  const claimed = await markHomeClaimed(conn, input.homeId, input.userId);
  if (claimed === 0) throw new HttpError(409, conflictCode, "Home has already been claimed");

  // Mọi mã còn lại của nhà (nếu có) mất hiệu lực: nhà đã có chủ
  await revokeUnusedTokens(conn, input.homeId, input.actorUserId ?? null);

  await insertOwnerMember(conn, input.homeId, input.userId);

  const home = await getHomeRow(input.homeId, conn);
  if (!home) throw notFound("Home not found");
  return home;
}
