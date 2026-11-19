// Claim nhà bằng mã/QR kích hoạt (FR-3.1 → 3.7, CONTRACT §4.2 Claim).
//
// Thứ tự cố định: giới hạn tốc độ → mã tồn tại (404) → đã dùng (409) / thu hồi, hết hạn (410) →
// transaction assignOwner (race-safe, FR-3.4). 100% lần thử ghi activation_logs + audit (FR-3.7);
// lần THẤT BẠI ghi bằng kết nối pool riêng, ngoài transaction, nên rollback không làm mất log.
// Không bao giờ log/ trả mã bản rõ — chỉ code_hash nằm trong activation_logs.
import type { RequestMeta } from "../../../../core/http/request-meta";
import { hashActivationCode, normalizeActivationCode, parseQrPayload } from "../../domain/activation-code";
import { withTransaction } from "../../../../infrastructure/database/db";
import { eventBus } from "../../../../shared/events/event-bus";
import { HttpError } from "../../../../shared/errors/http-error";
import type { AuthContext } from "../../../../core/auth/auth-context";
import { assignOwner } from "../../domain/activation";
import { toHome } from "../../domain/home.mapper";
import type { Home } from "../../domain/home.types";
import { logEvent } from "../../../audit";
import { notifyStaff, notifyUser } from "../../../notifications";
import {
  finalizeActivationAttempt,
  findTokenByHash,
  insertPendingAttempt,
  listAccountFailures,
  listCodeFailures,
} from "../../infrastructure/claim.repository";
import type { ClaimInput } from "./claim-home.dto";

const MINUTE_MS = 60 * 1000;
const HOUR_MS = 60 * MINUTE_MS;
const DAY_MS = 24 * HOUR_MS;

// FR-3.6
const LIMIT_ACCOUNT_SHORT = { max: 5, windowMs: 15 * MINUTE_MS };
const LIMIT_ACCOUNT_DAY = { max: 20, windowMs: DAY_MS };
const LIMIT_CODE_HOUR = { max: 5, windowMs: HOUR_MS };

interface AttemptContext {
  auth: AuthContext;
  meta: RequestMeta;
  method: "qr" | "code";
  codeHash: string | null;
  homeId: number | null;
  tokenId: number | null;
  /** id dòng activation_logs PENDING của lần thử này (ghi trước khi đếm giới hạn). */
  attemptId: number;
}

/**
 * Số giây phải chờ để số lần thử trong cửa sổ tụt xuống mức cho phép; 0 nếu chưa vượt. `attempts` ĐÃ gồm
 * chính lần thử hiện tại (dòng PENDING): cho phép tối đa `max` lần thử, lần thứ max+1 bị chặn như trước đây.
 */
function retryAfterSeconds(attempts: readonly Date[], rule: { max: number; windowMs: number }): number {
  if (attempts.length <= rule.max) return 0;
  // Cần (attempts.length - max) lần cũ nhất trượt ra khỏi cửa sổ
  const releasing = attempts[attempts.length - 1 - rule.max];
  const waitMs = releasing.getTime() + rule.windowMs - Date.now();
  return Math.max(1, Math.ceil(waitMs / 1000));
}

async function recordFailure(ctx: AttemptContext, reason: string): Promise<void> {
  try {
    // Chốt dòng PENDING bằng kết nối pool riêng — không nằm trong transaction claim nên không bị rollback
    await finalizeActivationAttempt(ctx.attemptId, { homeId: ctx.homeId, tokenId: ctx.tokenId, result: "failed", reason });
  } catch (err) {
    console.error("[claim] activation_logs insert failed:", err instanceof Error ? err.message : "unknown error");
  }
  await logEvent({
    eventType: "ACTIVATION_FAILED",
    homeId: ctx.homeId,
    actorUserId: ctx.auth.userId,
    message: "Kích hoạt nhà thất bại",
    ip: ctx.meta.ip,
    userAgent: ctx.meta.userAgent,
    details: { method: ctx.method, reason },
  });
}

async function failWith(ctx: AttemptContext, status: number, code: string, reason: string, detail: string): Promise<never> {
  await recordFailure(ctx, reason);
  throw new HttpError(status, code, detail);
}

/**
 * FR-3.6: 5 lần sai / 15 phút và 20 lần sai / 24 giờ theo tài khoản, 5 lần sai / giờ theo mã.
 * Dòng PENDING của lần thử này đã được ghi trước (claimHome) và được đếm cùng các lần sai trước đó.
 */
async function enforceRateLimits(ctx: AttemptContext): Promise<void> {
  const [short, day, perCode] = await Promise.all([
    listAccountFailures(ctx.auth.userId, LIMIT_ACCOUNT_SHORT.windowMs),
    listAccountFailures(ctx.auth.userId, LIMIT_ACCOUNT_DAY.windowMs),
    ctx.codeHash ? listCodeFailures(ctx.codeHash, LIMIT_CODE_HOUR.windowMs) : Promise.resolve<Date[]>([]),
  ]);
  const retryAfter = Math.max(
    retryAfterSeconds(short, LIMIT_ACCOUNT_SHORT),
    retryAfterSeconds(day, LIMIT_ACCOUNT_DAY),
    retryAfterSeconds(perCode, LIMIT_CODE_HOUR)
  );
  if (retryAfter === 0) return;

  // Lần bị chặn vẫn được ghi: dòng PENDING chuyển thành RATE_LIMITED (không tính vào giới hạn để không tự kéo dài khoá)
  try {
    await finalizeActivationAttempt(ctx.attemptId, { homeId: null, tokenId: null, result: "failed", reason: "RATE_LIMITED" });
  } catch (err) {
    console.error("[claim] activation_logs insert failed:", err instanceof Error ? err.message : "unknown error");
  }
  await logEvent({
    eventType: "CLAIM_RATE_LIMITED",
    actorUserId: ctx.auth.userId,
    message: "Quá nhiều lần nhập mã kích hoạt sai",
    ip: ctx.meta.ip,
    userAgent: ctx.meta.userAgent,
    details: { method: ctx.method, retry_after_seconds: retryAfter },
  });
  throw new HttpError(429, "RATE_LIMITED", "Too many failed activation attempts", { retry_after_seconds: retryAfter });
}

export async function claimHome(auth: AuthContext, input: ClaimInput, meta: RequestMeta): Promise<{ home: Home; role: "OWNER" }> {
  const method: "qr" | "code" = input.qrPayload !== undefined ? "qr" : "code";

  // Chuẩn hoá mã. Sai định dạng/chữ ký → coi như không tồn tại (không lộ lý do cho kẻ dò mã)
  let code12: string | null = null;
  let invalidReason: "INVALID_QR" | "NOT_FOUND" | null = null;
  if (input.qrPayload !== undefined) {
    code12 = parseQrPayload(input.qrPayload);
    if (code12 === null) invalidReason = "INVALID_QR";
  } else if (input.code !== undefined) {
    code12 = normalizeActivationCode(input.code);
    if (code12 === null) invalidReason = "NOT_FOUND";
  }
  const ctx: AttemptContext = {
    auth,
    meta,
    method,
    codeHash: code12 === null ? null : hashActivationCode(code12),
    homeId: null,
    tokenId: null,
    attemptId: 0,
  };

  // Ghi lần thử PENDING TRƯỚC khi đếm: request song song cùng thấy nhau nên không thể cùng lọt qua giới hạn.
  // Lỗi DB ở đây → 500 (đóng kín, không cho thử khi không đếm được).
  ctx.attemptId = await insertPendingAttempt({
    userId: auth.userId,
    codeHash: ctx.codeHash,
    method,
    ip: meta.ip,
    userAgent: meta.userAgent,
  });
  await enforceRateLimits(ctx);

  if (invalidReason !== null || ctx.codeHash === null) {
    return failWith(ctx, 404, "NOT_FOUND", invalidReason ?? "NOT_FOUND", "Activation code not found");
  }

  const token = await findTokenByHash(ctx.codeHash);
  if (!token) return failWith(ctx, 404, "NOT_FOUND", "NOT_FOUND", "Activation code not found");
  ctx.homeId = token.home_id;
  ctx.tokenId = token.id;

  if (token.used_at !== null) return failWith(ctx, 409, "ALREADY_USED", "ALREADY_USED", "Activation code was already used");
  if (token.revoked_at !== null) return failWith(ctx, 410, "EXPIRED", "REVOKED", "Activation code was revoked");
  if (token.expires_at.getTime() <= Date.now()) return failWith(ctx, 410, "EXPIRED", "EXPIRED", "Activation code has expired");

  let home: Home;
  try {
    home = await withTransaction(async (conn) => {
      const row = await assignOwner(conn, {
        homeId: token.home_id,
        userId: auth.userId,
        tokenId: token.id,
        actorUserId: auth.userId,
      });
      // Chốt dòng PENDING thành success cùng transaction: claim và log hoặc cùng có hoặc cùng không
      // (rollback → dòng vẫn PENDING rồi được recordFailure chốt thành thất bại)
      await finalizeActivationAttempt(
        ctx.attemptId,
        { homeId: token.home_id, tokenId: token.id, result: "success", reason: null },
        conn
      );
      return toHome(row);
    });
  } catch (err) {
    // Thua cuộc đua (FR-3.4) hoặc lỗi khác: transaction đã rollback; ghi log thất bại ở kết nối riêng
    // Mọi nhánh đều phải chốt dòng PENDING, nếu không nó đếm vào giới hạn mãi
    await recordFailure(ctx, err instanceof HttpError && err.status === 409 ? "ALREADY_USED" : "ERROR");
    throw err;
  }

  await logEvent({
    eventType: "ACTIVATION_SUCCESS",
    homeId: home.id,
    actorUserId: auth.userId,
    message: `${auth.displayName} đã kích hoạt nhà "${home.name}"`,
    ip: meta.ip,
    userAgent: meta.userAgent,
    details: { method },
  });
  await notifyUser({
    userId: auth.userId,
    homeId: home.id,
    type: "HOME_CLAIMED",
    title: "Kích hoạt nhà thành công",
    message: `Bạn đã trở thành chủ nhà "${home.name}". Hãy thêm thành viên và thiết lập quy tắc tự động.`,
    severity: "success",
  });
  await notifyStaff({
    targetRole: "all",
    type: "HOME_CLAIMED",
    title: "Nhà đã được kích hoạt",
    message: `${auth.displayName} đã kích hoạt nhà "${home.name}".`,
    severity: "success",
    homeId: home.id,
    actor: { id: auth.userId, username: auth.username, role: auth.role },
  });
  eventBus.emit("home_changed", { home_id: home.id, user_ids: [auth.userId] });

  return { home, role: "OWNER" };
}
